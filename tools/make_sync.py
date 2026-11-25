"""Build game/sync/kick120.mp4: 2 s of silence, then 40 kicks at 120 BPM (first kick at 2.000 s).
Played through the same <video> element as the songs so device sync measures the real pipeline."""
import os, subprocess, wave
import numpy as np
SR, FIRST, N, GAP = 44100, 2.0, 40, 0.5
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
t = np.arange(int(0.35 * SR)) / SR
f = 45 + 110 * np.exp(-t * 30)                                  # pitch sweep 155 -> 45 Hz
kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
click = np.random.default_rng(1).standard_normal(len(t)) * np.exp(-t * 400) * 0.35   # beater attack
kick = (kick + click) * 0.9
x = np.zeros(int((FIRST + N * GAP + 1.0) * SR))
for k in range(N):
    i = int(round((FIRST + k * GAP) * SR)); x[i:i + len(kick)] += kick
x = np.clip(x, -1, 1)
tmp = os.path.join(ROOT, "game", "sync", "_kick.wav")
with wave.open(tmp, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((x * 32000).astype(np.int16).tobytes())
out = os.path.join(ROOT, "game", "sync", "kick120.mp4")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out], check=True)
os.remove(tmp)
print(out, os.path.getsize(out), "bytes")
