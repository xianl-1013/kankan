# -*- coding: utf-8 -*-
"""Replace fixed-width English labels inside a UI frame with Chinese text."""
import io, sys, os
from PIL import Image, ImageDraw
import numpy as np

sys.path.insert(0, r'C:\Users\sjy\mir2-test\tools')
from button_maker import load_font


def sample_bg(im, box):
    """Darkest 40% of pixels inside the box = background (text is the bright part)."""
    x0, y0, x1, y1 = box
    arr = np.array(im)[y0:y1, x0:x1].reshape(-1, 4)
    px = arr[arr[:, 3] > 200]
    if len(px) == 0:
        return (24, 20, 16, 255)
    lum = px[:, :3].sum(axis=1)
    order = np.argsort(lum)
    bg = np.median(px[order[:max(1, len(order) * 15 // 100)], :3], axis=0)
    return tuple(int(v) for v in bg) + (255,)


def replace_labels(src, out, regions, color=(235, 235, 225, 255), stroke=1):
    """regions: list of (x0, y0, x1, y1, text)."""
    im = Image.open(src).convert('RGBA')
    arr = np.array(im)
    for (x0, y0, x1, y1, text) in regions:
        # per-row fill from neighbours: keeps the panel gradient intact
        for y in range(y0, y1):
            lx = max(0, x0 - 3)
            rx = min(im.width - 1, x1 + 3)
            c1 = arr[y, lx, :3].astype(np.int32)
            c2 = arr[y, rx, :3].astype(np.int32)
            arr[y, x0:x1, :3] = ((c1 + c2) // 2)
            arr[y, x0:x1, 3] = 255
    im = Image.fromarray(arr, 'RGBA')
    d = ImageDraw.Draw(im)
    for (x0, y0, x1, y1, text) in regions:
        w, h = x1 - x0, y1 - y0
        size = h - 3
        while size > 6:
            f = load_font(size)
            bbox = d.textbbox((0, 0), text, font=f)
            if bbox[2] - bbox[0] <= w - 2 and bbox[3] - bbox[1] <= h:
                break
            size -= 1
        f = load_font(size)
        bbox = d.textbbox((0, 0), text, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = x0 + (w - tw) // 2 - bbox[0]
        ty = y0 + (h - th) // 2 - bbox[1]
        d.text((tx, ty), text, font=f, fill=color,
               stroke_width=stroke, stroke_fill=(0, 0, 0, 255) if stroke else None)
    im.save(out)
    return im.size


CHARBOX_REGIONS = [
    (62, 10, 108, 23, '姓名'),
    (62, 28, 108, 41, '等级'),
    (146, 28, 174, 41, '职业'),
]
