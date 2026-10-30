#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
怒战资源整理：把 LayaAir 缓存文件按原始 CDN 路径还原成本地目录树。

缓存清单 layaairfiles.txt 是 JSON：
  { "<原始URL>": {"md5":"<缓存文件名>", "size":..., ...}, ... }

用法:
  python nz-assets.py restore   # 把已缓存的文件复制成原始目录结构
  python nz-assets.py list      # 列出清单里的所有 URL 与本地是否存在
"""
import json
import sys
import shutil
from pathlib import Path

CACHE = Path(r"C:\Users\sjy\mir2-test\shuangfu-cache\tt75e2035feaeb42c902\user\layaairGame")
OUT = Path(r"C:\Users\sjy\mir2-test\h5client\public\res")
CDN_PREFIX = "https://h5cdn-hs.dhsf.xqhuyu.com/219298/"


def load_index():
    raw = (CACHE / "layaairfiles.txt").read_text(encoding="utf-8")
    return json.loads(raw)


def url_to_rel(url: str) -> str:
    """https://.../219298/data/dev/res/private/x.png?v=1 -> data/dev/res/private/x.png"""
    u = url.split("?")[0]
    if u.startswith(CDN_PREFIX):
        return u[len(CDN_PREFIX):]
    # 未知前缀，取 219298 之后的部分
    i = u.find("/219298/")
    return u[i + len("/219298/"):] if i >= 0 else u.rsplit("/", 1)[-1]


def restore():
    idx = load_index()
    copied = missing = 0
    total_bytes = 0
    for url, meta in idx.items():
        if not isinstance(meta, dict):
            continue
        src = CACHE / meta.get("md5", "")
        if not src.is_file():
            missing += 1
            continue
        dst = OUT / url_to_rel(url)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists():
            shutil.copy2(src, dst)
            copied += 1
            total_bytes += src.stat().st_size
    print(f"复制 {copied} 个文件, 缺失 {missing} 个, 共 {total_bytes/1024/1024:.1f} MB")
    print(f"输出目录: {OUT}")


def list_all():
    idx = load_index()
    ok = bad = 0
    for url, meta in idx.items():
        if not isinstance(meta, dict):
            continue
        rel = url_to_rel(url)
        exists = (OUT / rel).is_file()
        print(("OK   " if exists else "MISS ") + rel)
        ok += exists
        bad += not exists
    print(f"\n本地有 {ok}, 缺 {bad}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "restore"
    if cmd == "restore":
        restore()
    elif cmd == "list":
        list_all()
    else:
        print(__doc__)
