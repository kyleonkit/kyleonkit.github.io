"""Build a "Be Kyle" drum-game song from a REAPER project + a video.

    python tools/build_song.py --id flowerman --title "Flower Man" --artist "Lame Genie" \
        --rpp "O:/My Drive/MASTER PROJECTS/Recordings/Deltarune (Flower Man)/deltarune-flowerman.rpp" \
        --track GGD --video "O:/My Drive/deltarune-flowerman-1080.mp4"

What it does
  1. Reads every unmuted MIDI item on --track (in-project MIDI, "HASDATA" items),
     converts note-ons to seconds with the project tempo map.
  2. Maps drum notes to the 5 lanes (kick, snare, tom1, tom2, cymbal). Default map
     covers GetGood Drums (GGD) + General MIDI; override with --map.
  3. Finds where the video starts on the project timeline by matching the video's
     audio against the kick/snare hits (or use --offset SECONDS).
  4. Assigns each note a difficulty tier: 0 = Easy (~50%), 1 = Medium (~75%), 2 = Kyle (all).
  5. Writes game/songs/<id>/chart.json, video.mp4 (540p, web-optimised), cover.jpg,
     and adds/updates the song in game/songs/songs.json.

Use --skip-video to rebuild only the chart.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(ROOT, "game", "songs")
LANES = ["kick", "snare", "tom1", "tom2", "cymbal"]

# MIDI note -> lane index. GGD (GetGood Drums, Kontakt) + General MIDI.
DEFAULT_MAP = {}
for n in (24, 35, 36): DEFAULT_MAP[n] = 0                       # kick
for n in (26, 37, 38, 39, 40): DEFAULT_MAP[n] = 1               # snare / rim / clap
for n in (47, 48, 50): DEFAULT_MAP[n] = 2                       # high / mid toms
for n in (41, 43, 45): DEFAULT_MAP[n] = 3                       # low / floor toms
# everything else in the drum range (hats, rides, crashes, chinas, splashes...) -> cymbal
CYMBAL_FALLBACK = range(42, 128)


# ── REAPER project parsing ────────────────────────────────────────────────
class Node:
    def __init__(self, tag, args):
        self.tag, self.args, self.lines, self.kids = tag, args, [], []

    def find(self, tag):
        return [k for k in self.kids if k.tag == tag]

    def val(self, key):
        for l in self.lines:
            if l.startswith(key + " "):
                return l[len(key) + 1:]
        return None


def parse_rpp(path):
    root = Node("ROOT", "")
    stack = [root]
    with open(path, encoding="utf-8", errors="replace") as f:
        for raw in f:
            l = raw.strip()
            if not l:
                continue
            if l.startswith("<"):
                parts = l[1:].split(" ", 1)
                n = Node(parts[0], parts[1] if len(parts) > 1 else "")
                stack[-1].kids.append(n)
                stack.append(n)
            elif l == ">":
                stack.pop()
            else:
                stack[-1].lines.append(l)
    return root.kids[0]


def unquote(s):
    s = (s or "").strip()
    return s[1:-1] if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'`" else s


class TempoMap:
    """Seconds <-> quarter-note beats, from TEMPO + TEMPOENVEX points."""

    def __init__(self, proj):
        t = proj.val("TEMPO").split()
        self.bpm0, self.num, self.den = float(t[0]), int(t[1]), int(t[2])
        pts = []
        for env in proj.find("TEMPOENVEX"):
            for l in env.lines:
                if l.startswith("PT "):
                    p = l.split()
                    pts.append((float(p[1]), float(p[2]), int(p[3]) if len(p) > 3 else 0))
        pts.sort()
        if not pts or pts[0][0] > 0:
            pts.insert(0, (0.0, pts[0][1] if pts else self.bpm0, 1))
        self.pts = pts
        # Pre-integrate beats at each point
        self.beats = [0.0]
        for i in range(1, len(pts)):
            self.beats.append(self.beats[-1] + self._seg_beats(i - 1, pts[i][0] - pts[i - 1][0]))

    def _seg_beats(self, i, dt):
        t0, b0, shape = self.pts[i]
        if shape == 0 and i + 1 < len(self.pts):                # linear ramp
            t1, b1, _ = self.pts[i + 1]
            k = (b1 - b0) / (t1 - t0) if t1 > t0 else 0
            return (b0 * dt + 0.5 * k * dt * dt) / 60
        return b0 * dt / 60

    def beat_at(self, t):
        i = max(j for j in range(len(self.pts)) if self.pts[j][0] <= t) if t >= 0 else 0
        return self.beats[i] + self._seg_beats(i, t - self.pts[i][0])

    def time_at(self, beat):
        lo, hi = 0.0, 3600.0
        for _ in range(60):
            mid = (lo + hi) / 2
            if self.beat_at(mid) < beat:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2


def midi_notes(proj, track_name, tempo):
    """[(project_seconds, midi_note, velocity)] for every unmuted MIDI item on the track."""
    tracks = [t for t in proj.find("TRACK") if unquote(t.val("NAME")) == track_name]
    if not tracks:
        sys.exit(f"No track named {track_name!r}")
    out = []
    for tr in tracks:
        for it in tr.find("ITEM"):
            if (it.val("MUTE") or "0").split()[0] == "1":
                continue
            pos, length = float(it.val("POSITION")), float(it.val("LENGTH"))
            soffs = float((it.val("SOFFS") or "0").split()[0])
            rate = float((it.val("PLAYRATE") or "1").split()[0])
            if abs(rate - 1) > 1e-6:
                print(f"  warning: item at {pos}s has playrate {rate}; ignoring rate")
            for src in it.find("SOURCE"):
                if not src.args.startswith("MIDI"):
                    continue
                hd = (src.val("HASDATA") or "").split()
                if not hd:
                    print(f"  warning: item at {pos}s is not in-project MIDI; skipped")
                    continue
                ppq = int(hd[1])
                b_start = tempo.beat_at(pos)
                b_soffs = tempo.beat_at(pos + soffs) - b_start if soffs else 0.0
                b_end = tempo.beat_at(pos + length)
                tick = 0
                for l in src.lines:
                    if l[:2] not in ("E ", "e "):
                        continue
                    p = l.split()
                    tick += int(p[1])
                    st, note, vel = int(p[2], 16), int(p[3], 16), int(p[4], 16)
                    if st & 0xF0 != 0x90 or vel == 0:
                        continue
                    beat = b_start + tick / ppq - b_soffs
                    if b_start - 1e-6 <= beat < b_end:
                        out.append((tempo.time_at(beat), note, vel))
    out.sort()
    return out


# ── Video alignment ───────────────────────────────────────────────────────
def onset_envelope(video, sr=11025, hop=22):
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "a.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", str(sr), wav], check=True)
        w = wave.open(wav)
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32)
        w.close()
    n = len(x) // hop
    e = np.log1p((x[: n * hop].reshape(n, hop) ** 2).mean(1))
    e = np.convolve(e, np.ones(3) / 3, "same")
    return np.maximum(0, np.diff(e, prepend=e[0])), sr / hop


def find_offset(video, times):
    """Seconds to ADD to project time to get video time."""
    on, fps = onset_envelope(video)
    T = np.array(times)
    n = len(on)

    def score(lag, win):
        idx = np.round((T + lag) * fps).astype(int)
        idx = idx[(idx >= win) & (idx < n - win)]
        if win == 0:
            return on[idx].sum()
        return sum(on[i - win:i + win + 1].max() for i in idx)

    coarse = sorted(((score(l, 0), l) for l in np.arange(-30, 30, 0.01)), reverse=True)
    lag0 = coarse[0][1]
    fine = sorted(((score(l, 3), l) for l in np.arange(lag0 - 0.05, lag0 + 0.05, 0.002)), reverse=True)
    conf = coarse[0][0] / max(1e-9, coarse[1][0] if abs(coarse[1][1] - lag0) > 0.05 else coarse[2][0])
    return round(float(fine[0][1]), 4), conf


# ── Difficulty tiers ──────────────────────────────────────────────────────
def assign_tiers(notes, tempo):
    """notes: list of dicts with t (project s), lane, vel. Adds 'tier' in place.
    Within each bar, notes are ranked by importance; the top 50% are Easy,
    the next 25% Medium, the rest Kyle-only."""
    lane_w = [2.0, 2.2, 1.4, 1.4, 1.0]
    bars = {}
    for nt in notes:
        beat = tempo.beat_at(nt["t"])
        bar = int(beat // tempo.num)
        pos = beat - bar * tempo.num
        frac = pos % 1
        if abs(pos) < 0.02:
            metric = 5
        elif frac < 0.02 or frac > 0.98:
            metric = 4 if int(round(pos)) % 2 == 0 else 3.5
        elif abs(frac - 0.5) < 0.02:
            metric = 2.5
        elif abs(frac - 0.25) < 0.02 or abs(frac - 0.75) < 0.02:
            metric = 1
        else:
            metric = 1.5  # triplets etc.
        nt["_score"] = metric * 4 + lane_w[nt["lane"]] + nt["vel"] / 127
        bars.setdefault(bar, []).append(nt)
    for group in bars.values():
        group.sort(key=lambda n: (-n["_score"], n["t"]))
        k = len(group)
        e, m = math.ceil(k * 0.5), math.ceil(k * 0.75)
        for r, nt in enumerate(group):
            nt["tier"] = 0 if r < e else 1 if r < m else 2
    # Easy: never more than 2 pads at once
    by_time = {}
    for nt in notes:
        by_time.setdefault(round(nt["t"], 3), []).append(nt)
    for chord in by_time.values():
        easy = sorted([n for n in chord if n["tier"] == 0], key=lambda n: -n["_score"])
        for nt in easy[2:]:
            nt["tier"] = 1


# ── Main ──────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="folder name, e.g. flowerman")
    ap.add_argument("--title", required=True)
    ap.add_argument("--artist", default="Lame Genie")
    ap.add_argument("--rpp", required=True)
    ap.add_argument("--track", default="GGD", help="track holding the drum MIDI")
    ap.add_argument("--video", required=True)
    ap.add_argument("--offset", type=float, help="video time = project time + offset (auto if omitted)")
    ap.add_argument("--map", help='JSON {"midi_note": lane_index} overrides')
    ap.add_argument("--cover-at", type=float, default=None, help="seconds into the video for cover.jpg")
    ap.add_argument("--skip-video", action="store_true")
    a = ap.parse_args()

    proj = parse_rpp(a.rpp)
    tempo = TempoMap(proj)
    raw = midi_notes(proj, a.track, tempo)
    print(f"{len(raw)} drum hits on track {a.track!r}, tempo {tempo.bpm0} {tempo.num}/{tempo.den}")

    nmap = dict(DEFAULT_MAP)
    if a.map:
        nmap.update({int(k): v for k, v in json.loads(a.map).items()})
    notes, unmapped = [], {}
    for t, n, v in raw:
        lane = nmap.get(n, 4 if n in CYMBAL_FALLBACK else None)
        if lane is None:
            unmapped[n] = unmapped.get(n, 0) + 1
            continue
        notes.append({"t": t, "lane": lane, "vel": v})
    if unmapped:
        print("  unmapped notes (ignored):", unmapped)
    # Merge same-lane hits closer than 45 ms (flams, layered cymbals)
    notes.sort(key=lambda n: (n["lane"], n["t"]))
    merged = []
    for nt in notes:
        if merged and merged[-1]["lane"] == nt["lane"] and nt["t"] - merged[-1]["t"] < 0.045:
            merged[-1]["vel"] = max(merged[-1]["vel"], nt["vel"])
            continue
        merged.append(nt)
    notes = sorted(merged, key=lambda n: (n["t"], n["lane"]))
    assign_tiers(notes, tempo)

    if a.offset is None:
        hits = [n["t"] for n in notes if n["lane"] in (0, 1)]
        offset, conf = find_offset(a.video, hits)
        print(f"auto offset: video = project {offset:+.3f}s (confidence {conf:.2f}; >1.05 is good)")
    else:
        offset = a.offset

    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.video],
                               capture_output=True, text=True, check=True).stdout)
    # Beat/bar lines for the highway (video time)
    beats, b = [], 0
    while True:
        t = tempo.time_at(b) + offset
        if t > dur:
            break
        if t >= 0:
            beats.append([round(t, 4), 1 if b % tempo.num == 0 else 0])
        b += 1

    counts = [sum(1 for n in notes if n["tier"] <= k) for k in range(3)]
    chart = {
        "id": a.id, "title": a.title, "artist": a.artist,
        "bpm": tempo.bpm0, "duration": round(dur, 3), "offset": offset,
        "lanes": LANES,
        "counts": {"easy": counts[0], "medium": counts[1], "kyle": counts[2]},
        "beats": beats,
        # [video_seconds, lane, tier]   tier 0 = easy+, 1 = medium+, 2 = kyle only
        "notes": [[round(n["t"] + offset, 4), n["lane"], n["tier"]] for n in notes if n["t"] + offset >= 0],
    }
    out = os.path.join(SONGS, a.id)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "chart.json"), "w") as f:
        json.dump(chart, f, separators=(",", ":"))
    print(f"chart: easy {counts[0]} / medium {counts[1]} / kyle {counts[2]} notes")

    if not a.skip_video:
        mp4 = os.path.join(out, "video.mp4")
        print("encoding 540p video (a few minutes)...")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.video,
                        "-vf", "scale=-2:540", "-c:v", "libx264", "-preset", "slow", "-crf", "28",
                        "-maxrate", "1200k", "-bufsize", "2400k", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", mp4], check=True)
        print(f"  video.mp4 {os.path.getsize(mp4) / 1e6:.1f} MB")
        at = a.cover_at if a.cover_at is not None else min(30, dur / 3)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(at), "-i", a.video, "-frames:v", "1",
                        "-vf", "scale=480:-2", "-q:v", "4", os.path.join(out, "cover.jpg")], check=True)

    # Song list
    lst_path = os.path.join(SONGS, "songs.json")
    lst = json.load(open(lst_path)) if os.path.exists(lst_path) else {"songs": []}
    entry = {"id": a.id, "title": a.title, "artist": a.artist, "bpm": tempo.bpm0,
             "duration": round(dur, 1), "counts": chart["counts"]}
    lst["songs"] = [s for s in lst["songs"] if s["id"] != a.id] + [entry]
    with open(lst_path, "w") as f:
        json.dump(lst, f, indent=2)
    print("songs.json updated")

    # Where each song came from: kept OUT of the public site (git-ignored)
    src_path = os.path.join(ROOT, "tools", "song-sources.local.json")
    src = json.load(open(src_path)) if os.path.exists(src_path) else {}
    src[a.id] = {"title": a.title, "rpp": a.rpp, "track": a.track, "video": a.video, "offset": offset,
                 "rebuild": f'python tools/build_song.py --id {a.id} --title "{a.title}" --artist "{a.artist}" '
                            f'--rpp "{a.rpp}" --track {a.track} --video "{a.video}"'}
    with open(src_path, "w") as f:
        json.dump(src, f, indent=2)


if __name__ == "__main__":
    main()
