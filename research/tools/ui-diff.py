#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
怒战 UI 像素级对比工具

用法:
  python ui-diff.py measure  <png>          # 分析单图，输出关键区域边界
  python ui-diff.py side     <a.png> <b.png>  # 并排输出
  python ui-diff.py overlay  <a.png> <b.png>  # 半透明叠加
  python ui-diff.py ball     <png>          # 精确测量红蓝球边界

所有输入统一等比缩放到 1024x640 设计尺寸后比较。
"""
import sys
from PIL import Image, ImageChops, ImageDraw

W, H = 1024, 640


def load(p):
    im = Image.open(p).convert('RGBA')
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return im


def save(im, name):
    out = rf'C:\Users\sjy\{name}.png'
    im.convert('RGB').save(out)
    print('saved', out)


def cmd_side(a, b):
    A, B = load(a), load(b)
    canvas = Image.new('RGB', (W, H * 2 + 8), (30, 30, 36))
    canvas.paste(A.convert('RGB'), (0, 0))
    canvas.paste(B.convert('RGB'), (0, H + 8))
    d = ImageDraw.Draw(canvas)
    d.text((6, 4), 'A: ' + a.split('\\')[-1], fill=(255, 230, 120))
    d.text((6, H + 12), 'B: ' + b.split('\\')[-1], fill=(255, 230, 120))
    save(canvas, 'diff-side')


def cmd_overlay(a, b):
    A, B = load(a), load(b)
    out = Image.blend(A.convert('RGB'), B.convert('RGB'), 0.5)
    save(out, 'diff-overlay')


def cmd_ball(p):
    """精确测量红/蓝球的像素边界"""
    im = load(p)
    px = im.load()
    red, blue = [], []
    for y in range(400, H):
        for x in range(0, 520):
            r, g, b = px[x, y][:3]
            if r > 110 and r > g * 1.7 and r > b * 1.7:
                red.append((x, y))
            elif b > 110 and b > r * 1.5 and b > g * 1.15:
                blue.append((x, y))
    for name, pts in (('red', red), ('blue', blue)):
        if not pts:
            print(f'{name}: none')
            continue
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        print(f'{name}: x {min(xs)}..{max(xs)}  y {min(ys)}..{max(ys)}  '
              f'w={max(xs)-min(xs)+1} h={max(ys)-min(ys)+1} n={len(pts)}')


def cmd_measure(p):
    """输出几条关键基线的亮/暗边界，用于定位 UI 元素"""
    im = load(p)
    px = im.load()
    print(f'== {p}  (1024x640)')
    # 底部横排：找 y=470..640 之间的高亮像素分布
    for y in (455, 470, 485, 500, 520, 540, 560, 580, 600, 620):
        runs, cur = [], None
        for x in range(W):
            r, g, b = px[x, y][:3]
            lum = (r + g + b) / 3
            if lum > 105:
                if cur is None: cur = x
            else:
                if cur is not None and x - cur >= 6:
                    runs.append((cur, x - 1))
                cur = None
        if cur is not None:
            runs.append((cur, W - 1))
        print(f'  y={y:3d}: ' + ' '.join(f'[{a}-{b}]' for a, b in runs[:14]))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    cmd = sys.argv[1]
    if cmd == 'side':    cmd_side(sys.argv[2], sys.argv[3])
    elif cmd == 'overlay': cmd_overlay(sys.argv[2], sys.argv[3])
    elif cmd == 'ball':  cmd_ball(sys.argv[2])
    elif cmd == 'measure': cmd_measure(sys.argv[2])
    else: print(__doc__)
