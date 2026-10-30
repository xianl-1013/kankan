# -*- coding: utf-8 -*-
"""批量把 UI 库里的石材面板换成怒战暗色材质。

策略（保守，避免破坏图标/特效）：
  - 只处理尺寸 >= MIN_W x MIN_H 的帧（面板/底板/大按钮）
  - 跳过高饱和帧（彩色图标、特效、角色）
  - 跳过几乎全透明或几乎全空的帧
  - 保留 alpha、尺寸、XY 偏移不变
"""
import sys, os, struct, zlib, shutil
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from restyle import restyle_array

sys.stdout.reconfigure(encoding='utf-8')

MIN_W, MIN_H = 90, 40
MAX_SAT_RATIO = 0.42      # 高饱和像素超过这个比例 -> 视为彩色图标，跳过


def read_lib(path):
    data = open(path, 'rb').read()
    ver, count = struct.unpack('<ii', data[:8])
    if ver >= 3:
        frameSeek = struct.unpack('<i', data[8:12])[0]
        hdr = 12
    else:
        frameSeek = None
        hdr = 8
    offs = struct.unpack('<%di' % count, data[hdr:hdr + 4 * count])
    frames = []
    for i, off in enumerate(offs):
        w, h, x, y, sx, sy = struct.unpack('<hhhhhh', data[off:off + 12])
        shadow = data[off + 12]
        ln = struct.unpack('<i', data[off + 13:off + 17])[0]
        comp = data[off + 17:off + 17 + ln]
        # mask 层（若存在）
        extra = b''
        if shadow >> 7:
            mstart = off + 17 + ln
            mlen = struct.unpack('<i', data[mstart + 13:mstart + 17])[0] if True else 0
            extra = data[mstart:mstart + 17 + mlen]
        frames.append(dict(w=w, h=h, x=x, y=y, sx=sx, sy=sy, shadow=shadow,
                           comp=comp, extra=extra))
    tail = data[frameSeek:] if frameSeek is not None else b''
    return ver, count, frames, tail


def decode(frame):
    try:
        raw = zlib.decompress(frame['comp'], 16 + zlib.MAX_WBITS)
    except Exception:
        try:
            raw = zlib.decompress(frame['comp'])
        except Exception:
            return None
    w, h = frame['w'], frame['h']
    if w <= 0 or h <= 0 or len(raw) < w * h * 4:
        return None
    arr = np.frombuffer(raw[:w * h * 4], dtype=np.uint8).reshape(h, w, 4)
    return arr[:, :, [2, 1, 0, 3]].copy()   # BGRA -> RGBA


def encode(arr_rgba):
    bgra = arr_rgba[:, :, [2, 1, 0, 3]].tobytes()
    return zlib.compress(bgra, 6)


def should_restyle(arr):
    h, w = arr.shape[:2]
    if w < MIN_W or h < MIN_H:
        return False
    a = arr[..., 3]
    if (a > 30).mean() < 0.15:
        return False
    rgb = arr[..., :3].astype(np.float32)
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    sat = np.where(mx > 10, (mx - mn) / np.maximum(mx, 1), 0)
    if (sat > 0.45).mean() > MAX_SAT_RATIO:
        return False
    return True


def rebuild(path, out_path):
    ver, count, frames, tail = read_lib(path)
    changed = 0
    skipped = 0
    for f in frames:
        arr = decode(f)
        if arr is None:
            skipped += 1
            continue
        if not should_restyle(arr):
            skipped += 1
            continue
        new_arr = restyle_array(arr)
        comp = encode(new_arr)
        if len(comp) >= len(f['comp']) * 1.8:
            skipped += 1
            continue
        f['comp'] = comp
        changed += 1

    # 重新打包
    hdr = 12 if ver >= 3 else 8
    offsets = []
    body = []
    pos = hdr + 4 * count
    for f in frames:
        offsets.append(pos)
        rec = struct.pack('<hhhhhhBi', f['w'], f['h'], f['x'], f['y'], f['sx'], f['sy'],
                          f['shadow'], len(f['comp'])) + f['comp'] + f['extra']
        body.append(rec)
        pos += len(rec)
    frameSeek = pos
    out = struct.pack('<iii', ver, count, frameSeek) if ver >= 3 else struct.pack('<ii', ver, count)
    out += struct.pack('<%di' % count, *offsets)
    out += b''.join(body)
    out += tail
    open(out_path, 'wb').write(out)
    return count, changed, skipped, len(out)


if __name__ == '__main__':
    root = r'C:\Users\sjy\mir2-test'
    data = os.path.join(root, r'Crystal\Build\Client\Release\Data')
    targets = ['Prguse', 'Prguse2', 'Prguse3', 'Title', 'UI_32bit']
    for name in targets:
        src = os.path.join(data, name + '.Lib')
        if not os.path.exists(src):
            print('missing', src); continue
        bak = src + '.bulkbak'
        if not os.path.exists(bak):
            shutil.copy2(src, bak)
        out = src + '.new'
        cnt, ch, sk, size = rebuild(src, out)
        print(f'{name}: 总帧={cnt} 已换材质={ch} 跳过={sk} 输出={size}B')
