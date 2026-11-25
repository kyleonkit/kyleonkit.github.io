"""Find where a video sits on a REAPER project's timeline by matching audio.

Rebuilds a rough mono "render" of the project from its unmuted audio items
(recorded guitar / bass / vocal stems, imported backing tracks...), then
cross-correlates its onset envelope with the video's soundtrack.
Much more reliable than matching drum MIDI alone against a dense mix.

    offset, checks = align(proj, rpp_path, video_path)
    video_time = project_time + offset
    checks = [(window_start_project_s, local_offset, peak_quality), ...]
"""
import os
import subprocess

import numpy as np

SR = 8000
HOP = 40                      # 5 ms frames
FPS = SR / HOP
AUDIO_SOURCES = ("WAVE", "MP3", "FLAC", "VORBIS", "OPUS")


def _unquote(s):
    s = (s or "").strip()
    return s[1:-1] if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'`" else s


def decode(path, start=0.0, dur=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start:.4f}", "-i", path]
    if dur is not None:
        cmd += ["-t", f"{dur:.4f}"]
    cmd += ["-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    out = subprocess.run(cmd, capture_output=True).stdout
    return np.frombuffer(out, np.float32)


def onset_env(x):
    n = len(x) // HOP
    e = np.log1p(1000 * (x[: n * HOP].reshape(n, HOP) ** 2).mean(1))
    d = np.maximum(0, np.diff(e, prepend=e[:1]))
    return d - d.mean()


def audio_items(proj, rpp_path):
    """[(position_s, length_s, source_offset_s, file)] for unmuted audio items on unmuted tracks."""
    base = os.path.dirname(rpp_path)
    out = []
    for tr in proj.find("TRACK"):
        ms = (tr.val("MUTESOLO") or "0").split()
        if ms and ms[0] == "1":
            continue
        for it in tr.find("ITEM"):
            if (it.val("MUTE") or "0").split()[0] == "1":
                continue
            if abs(float((it.val("PLAYRATE") or "1").split()[0]) - 1) > 1e-6:
                continue
            srcs = it.find("SOURCE")
            if not srcs or srcs[0].args.split()[0] not in AUDIO_SOURCES:
                continue
            f = _unquote(srcs[0].val("FILE"))
            if not f:
                continue
            cands = [f if os.path.isabs(f) else os.path.join(base, f), os.path.join(base, os.path.basename(f))]
            f = next((c for c in cands if os.path.exists(c)), None)
            if not f:
                continue
            out.append((float(it.val("POSITION")), float(it.val("LENGTH")),
                        float((it.val("SOFFS") or "0").split()[0]), f))
    return out


def project_mix(items):
    end = max(p + l for p, l, _, _ in items)
    mix = np.zeros(int(end * SR) + SR, np.float32)
    cache = {}
    for p, l, so, f in items:
        if f not in cache:
            y = decode(f)
            cache[f] = y / (np.abs(y).max() + 1e-6) if len(y) else y   # level-match stems
        a = int(max(0.0, so) * SR)
        x = cache[f][a:a + int(l * SR)]
        if not len(x):
            continue
        i = int(p * SR)
        mix[i:i + len(x)] += x[: len(mix) - i]
    return mix


def xcorr_peak(v, p, lo, hi):
    """Lag L (frames) in [lo, hi] maximising sum v[t] * p[t - L]; returns (L, quality)."""
    n = 1 << int(np.ceil(np.log2(len(v) + len(p))))
    c = np.fft.irfft(np.fft.rfft(v, n) * np.conj(np.fft.rfft(p, n)), n)
    lags = np.arange(lo, hi + 1)
    vals = c[lags % n]
    k = int(np.argmax(vals))
    best = vals[k]
    mask = np.abs(lags - lags[k]) > FPS * 0.1                     # runner-up at least 100 ms away
    second = vals[mask].max() if mask.any() else 0
    return int(lags[k]), float(best / second) if second > 0 else 99.0


def align(proj, rpp_path, video, window=30.0, log=print):
    items = audio_items(proj, rpp_path)
    if not items:
        return None, [], 0.0
    log(f"  audio align: {len(items)} audio items")
    P = onset_env(project_mix(items))
    V = onset_env(decode(video))
    L, q = xcorr_peak(V, P, int(-120 * FPS), int(120 * FPS))
    offset = L / FPS
    checks = []
    w = int(window * FPS)
    for s in range(0, len(P) - w, w):
        seg = np.zeros_like(P)
        seg[s:s + w] = P[s:s + w]
        if np.abs(seg).sum() < 1e-3:
            continue
        l2, q2 = xcorr_peak(V, seg, L - int(2 * FPS), L + int(2 * FPS))
        checks.append((s / FPS, l2 / FPS, q2))
    return round(offset, 4), checks, q
