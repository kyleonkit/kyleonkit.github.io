"""Generate every Kyle on Kit brand asset from assets/source-logo.png.

Logo: the original artwork (yellow block on "ON"), with a transparent background.
Icons (favicon, Android launcher, QR centre): the word "KIT" alone, no box.

    python tools/make_brand.py [path/to/kyle-on-kit-qr-widget]

Writes:
  assets/logo.png, assets/kit.png, assets/favicon.png, assets/og-image.png
  qr/kyleonkit-qr.png, qr/kyleonkit-qr-phone.png
  (+ Android res drawables/icon if a widget project path is given)
"""
import os
import sys

import qrcode
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source-logo.png")
URL = "https://kyleonkit.github.io"
YELLOW = (255, 192, 0)

# Measured from the 1280x720 source
KYLE_BOX = (358, 213, 899, 368)     # white on black
ON_BOX = (382, 402, 583, 496)       # black letters inside the old yellow block
KIT_BOX = (623, 387, 899, 511)      # white on black
LEFT, RIGHT = 360, 896              # text column
LINE2_TOP, LINE2_H = 389, 120       # cap height of line 2
BLOCK_TOP, BLOCK_H = 390, 118
RADIUS = 7
GAP = 14                            # between ON and the block
INNER_H = 90                        # height of the word inside the block


def alpha_glyphs(img, box, invert=False):
    """Crop a region and return white glyphs on transparent, alpha from luminance."""
    # Red channel: white=255, yellow=255, black=0 → clean mask for both cases
    crop = img.crop(box).split()[0]
    if invert:
        crop = crop.point(lambda v: 255 - v)
    out = Image.new("RGBA", crop.size, (255, 255, 255, 0))
    out.putalpha(crop)
    bbox = crop.point(lambda v: 255 if v > 24 else 0).getbbox()
    glyphs = out.crop(bbox)
    glyphs.info["origin"] = (box[0] + bbox[0], box[1] + bbox[1])  # position in the source
    return glyphs


def tint(glyphs, rgb):
    solid = Image.new("RGBA", glyphs.size, rgb + (255,))
    solid.putalpha(glyphs.split()[3])
    return solid


def scale_h(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def rounded_block(w, h, r, ss=4):
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], radius=r * ss, fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    b = Image.new("RGBA", (w, h), YELLOW + (255,))
    b.putalpha(m)
    return b


ON_BLOCK = (360, 390, 613, 508)     # original yellow block around "ON"


def build_logo():
    """Original logo on a transparent background; returns (full, logo crop, white KIT glyphs)."""
    src = Image.open(SRC).convert("RGB")
    canvas = Image.new("RGBA", src.size, (0, 0, 0, 0))
    # White words: KYLE and KIT
    kyle = alpha_glyphs(src, KYLE_BOX)
    canvas.alpha_composite(kyle, kyle.info["origin"])
    kit = alpha_glyphs(src, KIT_BOX)
    canvas.alpha_composite(kit, kit.info["origin"])
    # Yellow block with black "ON", copied as-is under a clean rounded mask
    x0, y0, x1, y1 = ON_BLOCK
    block = src.crop(ON_BLOCK).convert("RGBA")
    block.putalpha(rounded_block(x1 - x0, y1 - y0, RADIUS).split()[3])
    canvas.alpha_composite(block, (x0, y0))

    logo = canvas.crop((350, 205, 907, 519))
    return canvas, logo, kit


def qr_image(badge, size, quiet=4):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=1, border=0)
    q.add_data(URL)
    q.make(fit=True)
    m = q.get_matrix()
    cells = len(m) + quiet * 2
    px = size // cells
    size = px * cells
    im = Image.new("RGB", (size, size), (255, 255, 255))
    d = ImageDraw.Draw(im)
    for y, row in enumerate(m):
        for x, v in enumerate(row):
            if v:
                d.rectangle([(x + quiet) * px, (y + quiet) * px,
                             (x + quiet + 1) * px - 1, (y + quiet + 1) * px - 1], fill=(0, 0, 0))
    bw = int(size * 0.24)
    b = tint(badge, (0, 0, 0))
    b = b.resize((bw, round(bw * b.height / b.width)), Image.LANCZOS)
    pad = int(px * 1.2)
    x0, y0 = (size - b.width) // 2, (size - b.height) // 2
    d.rounded_rectangle([x0 - pad, y0 - pad, x0 + b.width + pad, y0 + b.height + pad], radius=pad, fill=(255, 255, 255))
    im.paste(b, (x0, y0), b)
    return im


def font(sz, bold=True):
    names = ["ariblk.ttf", "arialbd.ttf"] if bold else ["arial.ttf"]
    for n in names:
        try:
            return ImageFont.truetype(os.path.join("C:/Windows/Fonts", n), sz)
        except OSError:
            pass
    return ImageFont.load_default()


def phone_card(logo, badge):
    W, H = 1080, 2340
    card = Image.new("RGB", (W, H), (0, 0, 0))
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    for r in range(900, 0, -15):
        gd.ellipse([W // 2 - r, -r // 2 - 200, W // 2 + r, r // 2 + 200], fill=int(40 * (1 - r / 900)))
    card.paste(Image.new("RGB", (W, H), YELLOW), (0, 0), glow)
    lw = 720
    lg = logo.resize((lw, round(lw * logo.height / logo.width)), Image.LANCZOS)
    card.paste(lg, ((W - lw) // 2, 330), lg)
    q = qr_image(badge, 800)
    qs = q.width
    qx, qy = (W - qs) // 2, 830
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([qx - 30, qy - 30, qx + qs + 30, qy + qs + 30], radius=48, fill=(255, 255, 255))
    card.paste(q, (qx, qy))

    def center(t, y, f, fill):
        d.text(((W - d.textlength(t, font=f)) / 2, y), t, font=f, fill=fill)

    center("SCAN FOR ALL MY LINKS", qy + qs + 110, font(54), (255, 255, 255))
    center("kyleonkit.github.io", qy + qs + 200, font(46, False), YELLOW)
    return card


def square_icon(kit, size, fill=0.72):
    """White KIT on black, sized to stay inside round launcher masks."""
    sq = Image.new("RGB", (size, size), (0, 0, 0))
    bw = int(size * fill)
    b = tint(kit, (255, 255, 255))
    b = b.resize((bw, round(bw * b.height / b.width)), Image.LANCZOS)
    sq.paste(b, ((size - b.width) // 2, (size - b.height) // 2), b)
    return sq


def main():
    full, logo, badge = build_logo()
    a = lambda *p: os.path.join(ROOT, *p)
    os.makedirs(a("qr"), exist_ok=True)

    logo.save(a("assets", "logo.png"), optimize=True)
    badge.save(a("assets", "kit.png"))
    if os.path.exists(a("assets", "badge.png")):
        os.remove(a("assets", "badge.png"))
    square_icon(badge, 256).save(a("assets", "favicon.png"))
    og = Image.new("RGB", full.size, (0, 0, 0))
    og.paste(full, (0, 0), full)
    og.save(a("assets", "og-image.png"), optimize=True)

    qr_square = qr_image(badge, 1200)
    qr_square.save(a("qr", "kyleonkit-qr.png"))
    qr_square.resize((480, 480), Image.LANCZOS).save(a("assets", "qr.png"), optimize=True)  # site footer
    phone_card(logo, badge).save(a("qr", "kyleonkit-qr-phone.png"))
    print("site assets + QR written")

    if len(sys.argv) > 1:
        res = os.path.join(sys.argv[1], "app", "src", "main", "res")
        dn = os.path.join(res, "drawable-nodpi")
        logo.save(os.path.join(dn, "logo.png"))
        q = qr_square.convert("RGBA")
        n = q.width
        m = Image.new("L", q.size, 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, n - 1, n - 1], radius=n // 14, fill=255)
        q.putalpha(m)
        q.resize((900, 900), Image.LANCZOS).save(os.path.join(dn, "qr.png"))
        qr_square.resize((400, 400), Image.LANCZOS).save(os.path.join(dn, "widget_preview.png"))
        for d, s in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
            p = os.path.join(res, "mipmap-" + d)
            os.makedirs(p, exist_ok=True)
            square_icon(badge, s).save(os.path.join(p, "ic_launcher.png"))
        print("android res written")


if __name__ == "__main__":
    main()
