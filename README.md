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

It reads the drum MIDI from `--track` (GetGood Drums / General MIDI notes → Kick, Snare, Tom 1, Tom 2, Cymbal),
lines the notes up with the video automatically (prints the offset; pass `--offset` to override),
assigns Easy (~50%) / Medium (~75%) / Kyle (all) tiers, encodes the video and updates `songs.json`.
Where each song came from is saved locally (not published) in `tools/song-sources.local.json`.
Then `bash deploy.sh "Add <song>"`.

Testing: `game/?debug&mute` exposes `window.__bk` and plays muted.
