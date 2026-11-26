"""Build a "Be Kyle" drum-game song from a REAPER project + a video.

    python tools/build_song.py --id flowerman --title "Flower Man" --artist "Lame Genie" \
        --rpp "O:/My Drive/MASTER PROJECTS/Recordings/Deltarune (Flower Man)/deltarune-flowerman.rpp" \
        --track GGD --video "O:/My Drive/deltarune-flowerman-1080.mp4"

What it does
  1. Reads every unmuted MIDI item on --track (in-project MIDI, "HASDATA" items),
     converts note-ons to seconds with the project tempo map.
  2. Maps drum notes to the 5 lanes (kick, snare, tom1, tom2, cymbal). Default map
     covers GetGood Drums (GGD) + General MIDI; override with --map.
  3. Finds where the video starts on the project timeline by matching the kick MIDI
     against the low end (30-120 Hz) of the video's audio (or use --offset SECONDS).
  4. Assigns each note a difficulty tier: 0 = Easy (~50%), 1 = Medium (~75%), 2 = Kyle (all).
  5. Writes game/songs/<id>/chart.json, video.mp4 (360p30, ~4 MB/min), cover.jpg,
     and adds/updates the song in game/songs/songs.json.

Use --skip-video to rebuild only the chart.
"""
import argparse
import json
import math
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(ROOT, "game", "songs")
LANES = ["kick", "snare", "tom", "cymbal"]

# MIDI note -> lane index. Normally read from the drum track's note names
# (REAPER <MIDINOTENAMES>, see lane_for_name); this GGD map is the fallback.
# Cymbal lane = crash accents only. Hats, ride, bell, chinas, stack, splash
# and "grab" chokes are left out on purpose (Kyle's call, 2026-11-25).
DEFAULT_MAP = {24: 0, 26: 1, 35: 2, 36: 2, 52: 3, 54: 3, 58: 3}


def lane_for_name(name):
    n = name.lower()
    if "grab" in n or "choke" in n:
        return None
    if "kick" in n:
        return 0
    if "snare" in n:
        return 1
    if "rack" in n or "floor" in n or "tom" in n:      # all toms share one lane
        return 2
    if "crash" in n:
        return 3
    return None


def track_note_map(proj, track_name):
    for tr in proj.find("TRACK"):
        if unquote(tr.val("NAME")) != track_name:
            continue
        for nn in tr.find("MIDINOTENAMES"):
            m = {}
            for l in nn.lines:
                p = l.split(" ", 2)
                if len(p) == 3:
                    name = unquote(p[2].rsplit(" ", 2)[0])
                    lane = lane_for_name(name)
                    if lane is not None:
                        m[int(p[1])] = lane
            if m:
                return m
    return None


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
        pts, sigs = [], []
        for env in proj.find("TEMPOENVEX"):
            for l in env.lines:
                if l.startswith("PT "):
                    p = l.split()
                    pts.append((float(p[1]), float(p[2]), int(p[3]) if len(p) > 3 else 0))
                    ts = int(p[4]) if len(p) > 4 else 0
                    if ts:                       # num | den << 16
                        sigs.append((float(p[1]), ts & 0xFFFF, ts >> 16))
        pts.sort()
        self._sig_secs = sorted(sigs)
        if not pts or pts[0][0] > 0:
            pts.insert(0, (0.0, pts[0][1] if pts else self.bpm0, 1))
        self.pts = pts
        # Pre-integrate beats at each point
        self.beats = [0.0]
        for i in range(1, len(pts)):
            self.beats.append(self.beats[-1] + self._seg_beats(i - 1, pts[i][0] - pts[i - 1][0]))
        # Time signatures as (start quarter-note beat, bar length in QN, first bar index)
        sig = [(0.0, self.num, self.den)] + [(self.beat_at(t), n, d) for t, n, d in self._sig_secs]
        sig = [s for i, s in enumerate(sig) if i == len(sig) - 1 or sig[i + 1][0] > s[0] + 1e-6]
        self.sigs, bar = [], 0
        for i, (b, n, d) in enumerate(sig):
            blen = n * 4 / d
            self.sigs.append((b, blen, bar))
            if i + 1 < len(sig):
                bar += math.ceil((sig[i + 1][0] - b) / blen - 1e-6)

    def bar_at(self, beat):
        """(bar index, position in bar in QN, bar length in QN)"""
        b0, blen, bar0 = [s for s in self.sigs if s[0] <= beat + 1e-6][-1] if beat >= 0 else self.sigs[0]
        k = math.floor((beat - b0) / blen + 1e-6)
        return bar0 + k, beat - b0 - k * blen, blen

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
def kick_envelope(video, sr=8000, hop=40, nfft=512):
    """Onset strength of the 30-120 Hz band (where the kick drum lives), 200 frames/s."""
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", str(sr),
                                      "-f", "f32le", "-"], capture_output=True, check=True).stdout, np.float32)
    n = (len(x) - nfft) // hop
    frames = np.lib.stride_tricks.sliding_window_view(x, nfft)[::hop][:n] * np.hanning(nfft)
    S = np.abs(np.fft.rfft(frames, axis=1))
    f = np.fft.rfftfreq(nfft, 1 / sr)
    e = np.log1p(100 * S[:, (f >= 30) & (f < 120)].sum(1))
    return np.maximum(0, np.diff(e, prepend=e[0])), sr / hop


def find_offset(video, kicks, lo=-30.0, hi=30.0):
    """Seconds to ADD to project time to get video time, by lining the kick MIDI up with
    the low end of the video's audio. Much more reliable than the full mix: kick patterns
    aren't periodic at the beat, so it doesn't lock onto a neighbouring beat.
    Returns (offset, agreement) where agreement = share of 20 s windows that agree."""
    E, fps = kick_envelope(video)
    T = np.array(kicks)

    def score(Tw, g):
        idx = np.round((Tw + g) * fps).astype(int)
        idx = idx[(idx >= 2) & (idx < len(E) - 2)]
        return np.mean([E[j - 2:j + 3].max() for j in idx]) if len(idx) else 0.0

    coarse = np.arange(lo, hi, 0.01)
    g0 = coarse[int(np.argmax([score(T, g) for g in coarse]))]
    fine = np.arange(g0 - 0.03, g0 + 0.03, 0.002)
    g0 = float(fine[int(np.argmax([score(T, g) for g in fine]))])
    agree = total = 0
    for w0 in np.arange(T[0], T[-1], 20):
        Tw = T[(T >= w0) & (T < w0 + 20)]
        if len(Tw) < 10 or (Tw[0] + g0) * fps >= len(E):
            continue
        g = np.arange(g0 - 0.6, g0 + 0.6, 0.004)
        best = g[int(np.argmax([score(Tw, k) for k in g]))]
        total += 1
        agree += abs(best - g0) < 0.015
    # Frames are stamped at the window start; the onset is detected ~half a window (32 ms) early
    return round(g0 + 0.032, 4), (agree / total if total else 0.0)


# ── Two thumbs: never more than 2 notes at once ──────────────────────────
CHORD_PRIORITY = [3.2, 3.3, 1.0, 2.0]   # kick, snare, tom, crash (+ velocity 0..1 breaks ties)
# Kick and snare always win: the gap between groups is > 1 so velocity never reorders them.


def two_at_once(notes, window=0.03):
    """Group hits that land within `window` s of each other and keep the 2 most important.
    Kick and snare first (user request), then crash, then tom; louder first within a group."""
    out, group = [], []
    def flush():
        group.sort(key=lambda n: -(CHORD_PRIORITY[n["lane"]] + n["vel"] / 127))
        out.extend(group[:2])
    for nt in notes:
        if group and nt["t"] - group[0]["t"] > window:
            flush(); group = []
        group.append(nt)
    if group:
        flush()
    dropped = len(notes) - len(out)
    if dropped:
        print(f"  two-thumb limit: dropped {dropped} notes from 3+ note chords")
    return sorted(out, key=lambda n: (n["t"], n["lane"]))


# ── Difficulty tiers ──────────────────────────────────────────────────────
def assign_tiers(notes, tempo):
    """notes: list of dicts with t (project s), lane, vel. Adds 'tier' in place.
      0 Easy   - quarter notes only (max 2 pads at once). An offbeat 8th is added
                 only where it "warrants" it: when nothing lands on that quarter
                 (pushes, syncopated accents).
      1 Medium - everything on the 8th-note grid (straight or triplet 8ths).
    Every tier, Kyle included, has at most 2 notes at once (playable with two thumbs);
    see two_at_once().
      2 Kyle   - every note."""
    TOL = 0.06                                   # quantise tolerance in quarter notes
    for nt in notes:
        beat = tempo.beat_at(nt["t"])
        nt["_beat"] = beat
        nt["_q"] = math.floor(beat + TOL)        # which quarter note it belongs to
        frac = beat - nt["_q"]
        triplet = abs(frac - 1 / 3) < TOL or abs(frac - 2 / 3) < TOL
        nt["_grid"] = 4 if frac < TOL else 8 if abs(frac - 0.5) < TOL or triplet else 16
        nt["_score"] = CHORD_PRIORITY[nt["lane"]] + nt["vel"] / 127
        nt["tier"] = 2

    def cap(chord_notes, k, tier):
        by_time = {}
        for nt in chord_notes:
            by_time.setdefault(round(nt["t"], 3), []).append(nt)
        for chord in by_time.values():
            chord.sort(key=lambda n: -n["_score"])
            for nt in chord[:k]:
                nt["tier"] = min(nt["tier"], tier)

    # Medium: 8th grid only (straight or triplet 8ths)
    cap([n for n in notes if n["_grid"] <= 8], 2, 1)
    # Easy: quarters, plus the offbeat 8th of any quarter that has nothing on the beat
    quarters = {}
    for nt in notes:
        quarters.setdefault(nt["_q"], []).append(nt)
    easy = []
    for q in quarters.values():
        on_beat = [n for n in q if n["_grid"] == 4]
        easy += on_beat or [n for n in q if n["_grid"] == 8]
    cap(easy, 2, 0)


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

    nmap = track_note_map(proj, a.track)
    print(f"  note map from track names: {nmap}" if nmap else "  no note names on track; using GGD default map")
    nmap = nmap or dict(DEFAULT_MAP)
    if a.map:
        nmap.update({int(k): v for k, v in json.loads(a.map).items()})
    notes, unmapped = [], {}
    for t, n, v in raw:
        lane = nmap.get(n)
        if lane is None:
            unmapped[n] = unmapped.get(n, 0) + 1
            continue
        notes.append({"t": t, "lane": lane, "vel": v})
    if unmapped:
        print("  not charted (hats/ride/etc):", dict(sorted(unmapped.items())))
    # Merge same-lane hits closer than 45 ms (flams, layered cymbals)
    notes.sort(key=lambda n: (n["lane"], n["t"]))
    merged = []
    for nt in notes:
        if merged and merged[-1]["lane"] == nt["lane"] and nt["t"] - merged[-1]["t"] < 0.045:
            merged[-1]["vel"] = max(merged[-1]["vel"], nt["vel"])
            continue
        merged.append(nt)
    notes = sorted(merged, key=lambda n: (n["t"], n["lane"]))
    notes = two_at_once(notes)
    assign_tiers(notes, tempo)

    if a.offset is None:
        kicks = [n["t"] for n in notes if n["lane"] == 0]
        offset, agree = find_offset(a.video, kicks)
        print(f"auto offset: video = project {offset:+.3f}s ({agree:.0%} of 20 s windows agree; want 80%+)")
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
            pos = tempo.bar_at(b)[1]
            beats.append([round(t, 4), 1 if pos < 1e-6 else 0])
        b += 1

    notes = [n for n in notes if 0 <= n["t"] + offset < dur - 0.5]     # only what's in the video
    counts = [sum(1 for n in notes if n["tier"] <= k) for k in range(3)]
    chart = {
        "id": a.id, "title": a.title, "artist": a.artist,
        "bpm": tempo.pts[0][1], "duration": round(dur, 3), "offset": offset,
        "lanes": LANES,
        "counts": {"easy": counts[0], "medium": counts[1], "kyle": counts[2]},
        "beats": beats,
        # [video_seconds, lane, tier]   tier 0 = easy+, 1 = medium+, 2 = kyle only
        "notes": [[round(n["t"] + offset, 4), n["lane"], n["tier"]] for n in notes if 0 <= n["t"] + offset < dur - 0.5],
    }
    out = os.path.join(SONGS, a.id)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "chart.json"), "w") as f:
        json.dump(chart, f, separators=(",", ":"))
    print(f"chart: easy {counts[0]} / medium {counts[1]} / kyle {counts[2]} notes")

    if not a.skip_video:
        mp4 = os.path.join(out, "video.mp4")
        print("encoding 360p video (a few minutes)...")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.video,
                        "-vf", "scale=-2:360,fps=30", "-c:v", "libx264", "-preset", "slower", "-crf", "32",
                        "-maxrate", "420k", "-bufsize", "840k", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", mp4], check=True)
        print(f"  video.mp4 {os.path.getsize(mp4) / 1e6:.1f} MB")
        at = a.cover_at if a.cover_at is not None else min(30, dur / 3)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(at), "-i", a.video, "-frames:v", "1",
                        "-vf", "scale=480:-2", "-q:v", "4", os.path.join(out, "cover.jpg")], check=True)

    # Song list
    lst_path = os.path.join(SONGS, "songs.json")
    lst = json.load(open(lst_path)) if os.path.exists(lst_path) else {"songs": []}
    entry = {"id": a.id, "title": a.title, "artist": a.artist, "bpm": tempo.pts[0][1],
             "duration": round(dur, 1), "counts": chart["counts"]}
    ids = [s["id"] for s in lst["songs"]]
    if a.id in ids:
        lst["songs"][ids.index(a.id)] = entry
    else:
        lst["songs"].append(entry)
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

    # Setlist order: newest video first
    def vtime(sid):
        v = src.get(sid, {}).get("video")
        return os.path.getmtime(v) if v and os.path.exists(v) else 0
    lst["songs"].sort(key=lambda e: -vtime(e["id"]))
    with open(lst_path, "w") as f:
        json.dump(lst, f, indent=2)


if __name__ == "__main__":
    main()
