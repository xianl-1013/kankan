#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从怒战 CDN 批量下载地图资源。

用法:
  python nz-download.py map rr3        # 下载某地图组全部瓦片+mapbin+matrix
  python nz-download.py probe GROUP    # 探测某地图组是否存在
"""
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

CDN = "https://h5cdn-hs.dhsf.xqhuyu.com/219298/"
OUT = Path(r"C:\Users\sjy\mir2-test\h5client\public\res")
GRID = 12          # 每瓦片 12 格
TILE_W, TILE_H = 576, 384


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def prefix(n, width):
    return str(n).zfill(width)


def download_map(group):
    print(f"== {group} ==")
    # 1) mapbin 拿尺寸
    try:
        raw = get(f"{CDN}data/mapbin/{group}.json")
        meta = json.loads(raw)
        w, h = meta["w"], meta["h"]
        (OUT / "data/mapbin").mkdir(parents=True, exist_ok=True)
        (OUT / f"data/mapbin/{group}.json").write_bytes(raw)
        print(f"  mapbin: {w}x{h} 格")
    except Exception as e:
        print(f"  mapbin 失败: {e}")
        return

    cols = -(-w // GRID)   # ceil
    rows = -(-h // GRID)
    print(f"  瓦片网格: {cols} 列 x {rows} 行 = {cols*rows} 块")

    # 2) matrix
    try:
        mraw = get(f"{CDN}data/matrix/{group}matrix.js")
        (OUT / "data/matrix").mkdir(parents=True, exist_ok=True)
        (OUT / f"data/matrix/{group}matrix.js").write_bytes(mraw)
        print(f"  matrix: {len(mraw)} 字节")
    except Exception as e:
        print(f"  matrix 跳过: {e}")

    # 3) 瓦片
    d = OUT / f"data/map/{group}"
    d.mkdir(parents=True, exist_ok=True)
    ok = skip = fail = 0
    for row in range(rows):
        for col in range(cols):
            name = prefix(row, 3) + prefix(col, 4) + ".jpg"
            f = d / name
            if f.exists() and f.stat().st_size > 1000:
                skip += 1
                continue
            try:
                data = get(f"{CDN}data/map/{group}/{name}")
                f.write_bytes(data)
                ok += 1
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    fail += 1
            except Exception:
                fail += 1
        print(f"  行 {row+1}/{rows} 完成 (新增{ok} 已有{skip} 失败{fail})")
    print(f"  总计: 新增 {ok}, 已有 {skip}, 失败 {fail}")


def probe(group):
    for path in [f"data/mapbin/{group}.json", f"data/map/{group}/0000000.jpg"]:
        try:
            d = get(f"{CDN}{path}", timeout=10)
            print(f"  {path} -> OK {len(d)}B")
        except Exception as e:
            print(f"  {path} -> {e}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "map"
    arg = sys.argv[2] if len(sys.argv) > 2 else "rr3"
    if cmd == "map":
        download_map(arg)
    elif cmd == "probe":
        probe(arg)
    else:
        print(__doc__)
