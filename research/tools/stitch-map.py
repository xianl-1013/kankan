#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把地图瓦片拼成一张大图，验证命名规则与拼接方式。

怒战瓦片命名: {行:3位}{列:4位}.jpg
  前 3 位 = 纵向瓦片索引(行) -> Y
  后 4 位 = 横向瓦片索引(列) -> X
每瓦片 576x384 像素 = 12x12 格，每格 48x32 像素。

用法: python stitch-map.py [地图组] [输出文件]
"""
import sys
from pathlib import Path
from PIL import Image

RES = Path(r"C:\Users\sjy\mir2-test\h5client\public\res\data\map")
TILE_W, TILE_H = 576, 384


def tile_rc(name: str):
    """0260026.jpg -> (row=26, col=26)"""
    n = name.split(".")[0]
    if len(n) != 7:
        return None
    return int(n[:3]), int(n[3:])


def stitch(group: str, out: str):
    d = RES / group
    tiles = {}
    for f in d.iterdir():
        if f.suffix.lower() not in (".jpg", ".png"):
            continue
        rc = tile_rc(f.name)
        if rc:
            tiles[rc] = f
    if not tiles:
        print("没找到瓦片")
        return

    rows = [r for r, _ in tiles]
    cols = [c for _, c in tiles]
    minr, maxr = min(rows), max(rows)
    minc, maxc = min(cols), max(cols)

    W = (maxc - minc + 1) * TILE_W
    H = (maxr - minr + 1) * TILE_H
    canvas = Image.new("RGB", (W, H), (0, 0, 0))

    for (r, c), f in sorted(tiles.items()):
        im = Image.open(f)
        canvas.paste(im, ((c - minc) * TILE_W, (r - minr) * TILE_H))

    out_path = Path(out)
    canvas.save(out_path, quality=85)
    print(f"行 {minr}..{maxr}, 列 {minc}..{maxc}, 瓦片 {len(tiles)} 块")
    print(f"输出 {out_path}  {W}x{H}")


if __name__ == "__main__":
    group = sys.argv[1] if len(sys.argv) > 1 else "rr3"
    out = sys.argv[2] if len(sys.argv) > 2 else f"stitch_{group}.jpg"
    stitch(group, out)
