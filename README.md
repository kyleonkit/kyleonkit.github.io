# Kyle on Kit — Links

Linktree-style link page, hosted on GitHub Pages: https://kyleonkit.github.io/

Plain static site, no build step.

- `links.js` — **all content** (tagline, social icons, link buttons). Edit this to add/change links.
- `index.html` / `style.css` / `app.js` — layout, theme, rendering.
- `assets/` — logo (transparent PNG), favicon, social share image.

Icons: any [Simple Icons](https://simpleicons.org) slug (`youtube`, `instagram`, `tiktok`, `spotify`, …) or a built-in: `mail`, `link`, `calendar`, `cart`, `music`.
A link with an empty `url` shows greyed out as "Coming soon". `featured: true` makes it the yellow button.

Deploy: push to `main` — Pages serves from the repo root.
