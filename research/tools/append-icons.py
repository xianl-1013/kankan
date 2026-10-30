# -*- coding: utf-8 -*-
"""把怒战缓存里的图标 PNG 追加到 Crystal 的 Items.Lib 末尾。

Lib v3 布局（小端）：
  Int32 version=3 | Int32 count | Int32 frameSeek | Int32 offsets[count]
  Image[count]  (17 字节头 + gzip BGRA)
  Int32 frameCount | Frame[frameCount]   <- FrameSet，原样保留
"""
import struct, gzip, os, sys, json
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'C:\Users\sjy\mir2-test'
LIB = os.path.join(ROOT, r'Crystal\Build\Client\Release\Data\Items.Lib')
CAND = os.path.join(ROOT, r'tools\convert\icon-candidates.json')

# 候选索引 -> 用途标签（取自拼图目视）
PICK = {
    63: '剑-金', 64: '剑-银', 65: '刀-蓝', 66: '金锭', 67: '金符',
    68: '令牌-金', 69: '法杖-灰', 70: '法杖-蓝', 71: '令牌-红',
    80: '绿晶', 81: '紫晶', 82: '金狮', 83: '蓝晶', 84: '金纹',
    85: '绿纹', 88: '紫冠', 89: '蓝盾', 90: '蓝纹', 91: '红纹',
    92: '青玉', 93: '紫玉', 94: '宝箱', 95: '感叹',
}


def png_to_frame(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    arr = np.array(im)
    bgra = arr[:, :, [2, 1, 0, 3]].tobytes()
    comp = gzip.compress(bgra, 9)
    hdr = struct.pack('<hhhhhhBi', w, h, 0, 0, 0, 0, 0, len(comp))
    return hdr + comp, w, h


def main():
    data = open(LIB, 'rb').read()
    ver, count, frameSeek = struct.unpack('<iii', data[:12])
    if ver != 3:
        print('非 v3 Lib，中止'); return 1
    offs = struct.unpack('<%di' % count, data[12:12 + 4 * count])
    frames_blob = data[12 + 4 * count: frameSeek]
    frameset = data[frameSeek:]
    # frames_blob 内每帧相对起点偏移
    rel = [o - (12 + 4 * count) for o in offs]
    print(f'原: ver={ver} count={count} frameSeek={frameSeek} frameset={len(frameset)}B')

    cand = json.load(open(CAND, encoding='utf-8'))
    new_frames = []
    labels = []
    for idx, label in PICK.items():
        c = cand[idx]
        blob, w, h = png_to_frame(os.path.join(ROOT, c['path']))
        new_frames.append(blob)
        labels.append({'lib_index': count + len(new_frames) - 1, 'label': label,
                       'w': w, 'h': h, 'src': c['path']})
        print(f'  +{count + len(new_frames) - 1}: {label} {w}x{h}')

    new_count = count + len(new_frames)
    body = frames_blob + b''.join(new_frames)
    base = 12 + 4 * new_count
    new_offs = [base + r for r in rel]
    pos = base + len(frames_blob)
    for blob in new_frames:
        new_offs.append(pos)
        pos += len(blob)
    new_frameSeek = pos

    out = struct.pack('<iii', 3, new_count, new_frameSeek)
    out += struct.pack('<%di' % new_count, *new_offs)
    out += body
    out += frameset

    # 校验：回读确认帧数
    back = struct.unpack('<iii', out[:12])
    assert back == (3, new_count, new_frameSeek), back
    open(LIB + '.new', 'wb').write(out)
    print(f'新: count={new_count} frameSeek={new_frameSeek} 大小 {len(out)}B -> {LIB}.new')
    json.dump(labels, open(os.path.join(ROOT, r'tools\convert\new-icon-frames.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
