#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
给本地已有的每张精灵 PNG 下载同名 .json 图集描述文件。

怒战的精灵是 LayaAir 图集：xxx.png + xxx.json
json 里 frames 字段给出每一帧的精确矩形和锚点偏移（ox/oy），
用它绘制才能保证动画帧对齐、不出现分身。

用法: python nz-download-atlas.py [子目录]
  例: python nz-download-atlas.py data/monster
"""
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

CDN = "https://h5cdn-hs.dhsf.xqhuyu.com/219298/"
RES = Path(r"C:\Users\sjy\mir2-test\h5client\public\res")


def get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def main(subdir):
    base = RES / subdir if subdir else RES
    if not base.exists():
        print("目录不存在:", base)
        return

    pngs = sorted(base.rglob("*.png"))
    print(f"{base} 下共 {len(pngs)} 张 PNG")

    ok = skip = missing = 0
    for i, p in enumerate(pngs, 1):
        j = p.with_suffix(".json")
        if j.exists() and j.stat().st_size > 10:
            skip += 1
            continue
        rel = p.relative_to(RES).as_posix()
        try:
            data = get(f"{CDN}{rel[:-4]}.json")
            j.write_bytes(data)
            ok += 1
        except urllib.error.HTTPError as e:
            if e.code == 404:
                missing += 1
            else:
                print(f"  ! {rel} HTTP {e.code}")
        except Exception as e:
            print(f"  ! {rel} {e}")
        if i % 50 == 0:
            print(f"  {i}/{len(pngs)}  新增{ok} 已有{skip} 无json{missing}")

    print(f"完成: 新增 {ok}, 已有 {skip}, 服务端无对应 json {missing}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "")
