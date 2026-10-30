# -*- coding: utf-8 -*-
"""Rebuild a text-button frame as a Chinese button, keeping size / palette.

Two kinds of source frames:
  A) transparent-background text (STORAGE / GUILD / LOG IN / Exp.)
     -> render only the glyphs, transparent bg, keep the foreground colour
  B) framed buttons (BUY / CRAFT / ITEMS II)
     -> keep the original frame + shading, wipe the interior text, write Chinese
"""
import io, sys, os
from PIL import Image, ImageDraw, ImageFont
import numpy as np

if __name__ == '__main__' and (sys.stdout.encoding or '').lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\msyhbd.ttc',
    r'C:\Windows\Fonts\msyh.ttc',
    r'C:\Windows\Fonts\simhei.ttf',
    r'C:\Windows\Fonts\simsun.ttc',
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def analyse(im):
    arr = np.array(im)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    # a framed button is mostly opaque; bare text frames are mostly transparent
    opaque_ratio = float((alpha > 200).mean())
    transparent = opaque_ratio < 0.65
    rgb = arr[:, :, :3].reshape(-1, 3).astype(np.int32)
    vis = rgb[alpha.reshape(-1) > 128]
    if len(vis) == 0:
        return transparent, (40, 40, 40), (220, 180, 90)
    lum = vis.sum(axis=1)
    order = np.argsort(lum)
    bg = vis[order[:max(1, len(order) * 35 // 100)]].mean(axis=0)
    fg = vis[order[-max(1, len(order) * 10 // 100):]].mean(axis=0)
    return transparent, tuple(int(v) for v in bg), tuple(int(v) for v in fg)


def remake(src, text, out, fg_override=None, bg_override=None, scale=1.0):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    transparent, bg, fg = analyse(im)
    if fg_override:
        fg = fg_override
    if bg_override:
        bg = bg_override

    if transparent:
        base = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    else:
        # keep the outer 2px frame ring intact, wipe the interior with bg
        base = im.copy()
        d = ImageDraw.Draw(base)
        inset = max(3, min(w, h) // 8) if min(w, h) > 14 else 2
        d.rectangle([inset, inset, w - 1 - inset, h - 1 - inset], fill=bg + (255,))

    d = ImageDraw.Draw(base)
    pad = 0 if transparent else 4
    max_w = max(4, w - pad)
    max_h = max(6, h - pad)
    # glyph height: framed buttons keep breathing room, bare text can be big
    target = int((h * (0.55 if not transparent else 0.88)) * scale)
    # width fit preferred over height fit for CJK
    size = max(target, 8)
    while size > 6:
        f = load_font(size)
        bbox = d.textbbox((0, 0), text, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if tw <= max_w and th <= max_h:
            break
        size -= 1
    f = load_font(size)
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (w - tw) // 2 - bbox[0]
    ty = (h - th) // 2 - bbox[1]
    stroke = 0 if size < 10 else max(1, size // 10)

    # shadow for legibility, then glyphs
    if stroke:
        sh = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ds = ImageDraw.Draw(sh)
        ds.text((tx + 1, ty + 1), text, font=f, fill=(0, 0, 0, 150),
                stroke_width=stroke, stroke_fill=(0, 0, 0, 150))
        base = Image.alpha_composite(base, sh)
        d = ImageDraw.Draw(base)
    d.text((tx, ty), text, font=f, fill=fg + (255,),
           stroke_width=stroke, stroke_fill=(0, 0, 0, 255) if stroke else None)
    base.save(out)
    return dict(size=(w, h), transparent=transparent, fg=fg, bg=bg, font=size, stroke=stroke)


def remake_card(src, lines, out, fill=(238, 108, 20, 255), radius=8):
    """Rebuild a full card/icon frame (e.g. the TEST MODE sticker) from scratch."""
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    base = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([2, 2, w - 3, h - 3], radius=radius, fill=fill,
                        outline=(255, 255, 255, 255), width=3)
    n = len(lines)
    for i, line in enumerate(lines):
        size = int(h / n * 0.55)
        while size > 6:
            f = load_font(size)
            bbox = d.textbbox((0, 0), line, font=f)
            if bbox[2] - bbox[0] <= w - 12:
                break
            size -= 1
        f = load_font(size)
        bbox = d.textbbox((0, 0), line, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = (w - tw) // 2 - bbox[0]
        ty = int(h / n * i + (h / n - th) / 2) - bbox[1]
        d.text((tx, ty), line, font=f, fill=(255, 255, 255, 255))
    base.save(out)
    return dict(size=(w, h), lines=lines)


if __name__ == '__main__':
    src, text, out = sys.argv[1], sys.argv[2], sys.argv[3]
    print(remake(src, text, out))
