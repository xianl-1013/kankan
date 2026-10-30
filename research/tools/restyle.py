# -*- coding: utf-8 -*-
"""保留原版 UI 的轮廓/透明度，只替换材质风格。

算法：
  1. 按 HSV 把像素分成三类：金色浮雕 / 石材底 / 高光
  2. 金色   -> 提亮+加饱和（保持怒战的金色描边感）
  3. 石材   -> 映射成暗蓝黑渐变 + 叠加蜂窝晶格
  4. 高光/阴影 -> 按亮度重映射，保留立体感
  5. alpha 通道原样保留（不破坏透明区域）
"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.stdout.reconfigure(encoding='utf-8')


def hex_pattern(w, h, scale=8, color=(120, 150, 255), alpha=26):
    """蜂窝晶格纹理（尽量透明，只作材质暗示）。"""
    tex = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(tex)
    s = scale
    dx = s * 1.732
    for row in range(-1, h // s + 2):
        for col in range(-1, w // int(dx) + 2):
            cx = col * dx + (dx / 2 if row % 2 else 0)
            cy = row * s * 1.5
            pts = [(cx + s * np.cos(np.radians(60 * k)),
                    cy + s * np.sin(np.radians(60 * k))) for k in range(6)]
            d.polygon(pts, outline=color + (alpha,))
    return tex


def restyle_array(arr_rgba, dark=(10, 12, 22), deep=(4, 5, 10), gold_boost=1.45,
                  hex_scale=8, hex_alpha=26, hex_color=(120, 150, 255)):
    """numpy RGBA -> numpy RGBA。"""
    im = Image.fromarray(np.ascontiguousarray(arr_rgba), 'RGBA')
    return np.array(restyle_image(im, dark, deep, gold_boost, hex_scale, hex_alpha, hex_color))


def restyle(src, out, dark=(10, 12, 22), deep=(4, 5, 10), gold_boost=1.45,
            hex_scale=8, hex_alpha=26, hex_color=(120, 150, 255)):
    im = Image.open(src).convert('RGBA')
    res = restyle_image(im, dark, deep, gold_boost, hex_scale, hex_alpha, hex_color)
    res.save(out)
    return res.size


def restyle_image(im, dark=(10, 12, 22), deep=(4, 5, 10), gold_boost=1.45,
                  hex_scale=8, hex_alpha=26, hex_color=(120, 150, 255)):
    arr = np.array(im).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]

    mx = np.max(arr[..., :3], axis=-1)
    mn = np.min(arr[..., :3], axis=-1)
    sat = np.where(mx > 1, (mx - mn) / np.maximum(mx, 1), 0)
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # 金色：暖色、较高亮度、红>蓝
    gold = (r > 90) & (r > b + 35) & (g > b + 10) & (sat > 0.25) & (lum > 55)
    # 石材：低饱和
    stone = (~gold) & (sat < 0.28)
    # 其余（黑边/阴影/彩色）按石材处理但压暗

    out_arr = arr.copy()

    # ---- 石材 -> 暗色渐变（保留原亮度起伏做立体感）----
    t = np.clip(lum / 255.0, 0, 1) ** 0.85
    dk = np.array(dark, dtype=np.float32)
    dp = np.array(deep, dtype=np.float32)
    stone_rgb = dp[None, None, :] * (1 - t[..., None]) + dk[None, None, :] * t[..., None]
    # 原图的明暗细节以很弱的权重叠加，保住浮雕感
    detail = (arr[..., :3] - lum[..., None]) * 0.18
    stone_rgb = stone_rgb + detail

    m = stone[..., None]
    out_arr[..., :3] = np.where(m, stone_rgb, out_arr[..., :3])

    # ---- 金色 -> 提亮加饱和 ----
    gold_rgb = out_arr[..., :3].copy()
    mean = gold_rgb.mean(axis=-1, keepdims=True)
    boosted = np.clip(mean + (gold_rgb - mean) * gold_boost, 0, 255)
    boosted = np.clip(boosted * 1.08 + 12, 0, 255)
    out_arr[..., :3] = np.where(gold[..., None], boosted, out_arr[..., :3])

    res = Image.fromarray(np.clip(out_arr, 0, 255).astype(np.uint8), 'RGBA')

    # ---- 蜂窝晶格只加在石材区域 ----
    tex = hex_pattern(im.width, im.height, hex_scale, hex_color, hex_alpha)
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    layer.paste(tex, (0, 0), Image.fromarray(
        (stone * (a > 30)).astype(np.uint8) * 255, 'L'))
    res.alpha_composite(layer)

    return res


if __name__ == '__main__':
    root = r'C:\Users\sjy\mir2-test'
    srcdir = os.path.join(root, r'tools\convert\ui-restore')
    outdir = os.path.join(root, r'tools\convert\ui-restyle')
    os.makedirs(outdir, exist_ok=True)
    for name in ('Prguse_0.png', 'Prguse_1.png', 'Prguse_2.png'):
        src = os.path.join(srcdir, name)
        if not os.path.exists(src):
            print('missing', name); continue
        size = restyle(src, os.path.join(outdir, name))
        print(f'{name}: {size}')
