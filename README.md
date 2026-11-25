# Kyle on Kit — Links

Linktree-style link page, hosted on GitHub Pages: https://kyleonkit.github.io/

Plain static site, no build step.

- `links.js` — **all content** (tagline, social icons, link buttons). Edit this to add/change links.
- `index.html` / `style.css` / `app.js` — layout, theme, rendering.
- `assets/` — logo (transparent PNG), favicon, social share image.

Icons: any [Simple Icons](https://simpleicons.org) slug (`youtube`, `instagram`, `tiktok`, `spotify`, …) or a built-in: `mail`, `link`, `calendar`, `cart`, `music`.
A link with an empty `url` shows greyed out as "Coming soon". `featured: true` makes it the yellow button.

Deploy: push to `main` — Pages serves from the repo root.

## Be Kyle (drum game) — `game/`

Tap-along drum game linked from the top of the page ("Be Kyle").

- `game/index.html`, `game.css`, `game.js` — the game (song select, settings, highway, pads).
- `game/songs/songs.json` — the setlist shown on the song-select screen.
- `game/songs/<id>/` — one folder per song: `chart.json` (notes), `video.mp4` (540p), `cover.jpg`.

### Adding a song

```
python tools/build_song.py --id <id> --title "<Title>" --artist "Lame Genie" \
    --rpp "<path to the .rpp>" --track GGD --video "<path to the final video .mp4>"
```

It reads the drum MIDI from `--track` and maps notes by the track's REAPER note names (KICK, SNARE,
RACK + FLOOR → Tom (one lane), CRASH L/R/R2 → Cymbal). Hats, ride, bell, chinas, stack, splash and
"grab" chokes are deliberately not charted. Without note names it falls back to the GGD numbers.
Sync: lines the kick MIDI up with the 30–120 Hz band of the video's audio and prints the offset plus
how many 20 s windows agree (want 80%+; pass `--offset` to override). Notes after the video ends are dropped.
Tiers: Easy = quarter notes (an offbeat 8th only where nothing hits on that quarter; max 2 pads),
Medium = the 8th / triplet-8th grid (max 3 pads), Kyle = everything.
It also encodes the video (540p; GitHub's per-file limit is 100 MB) and updates `songs.json`.
Where each song came from is saved locally (not published) in `tools/song-sources.local.json`.
Then `bash deploy.sh "Add <song>"`.

Desktop (mouse + keyboard, window ≥ 900 px): plays full screen with the video behind the highway; keys shown under each lane (← ↓ ↑ → or A S D F; Space = kick, Enter = star power).

Testing: `game/?debug&mute` exposes `window.__bk` and plays muted.
