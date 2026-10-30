import struct, zlib, os, sys, io
import numpy as np
from PIL import Image, ImageDraw

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def read_lib_frames(path):
    """Yield (index, w, h, shadow, raw_bgra_or_None) for every frame."""
    f = open(path, 'rb')
    ver, count = struct.unpack('<ii', f.read(8))
    if ver >= 3:
        struct.unpack('<i', f.read(4))[0]
    offs = struct.unpack('<%di' % count, f.read(4 * count))
    for i, off in enumerate(offs):
        f.seek(off)
        hdr = f.read(17)
        if len(hdr) < 17:
            yield i, 0, 0, 0, None
            continue
        w, h, x, y, sx, sy = struct.unpack('<hhhhhh', hdr[:12])
        shadow = hdr[12]
        length = struct.unpack('<i', hdr[13:17])[0]
        if w <= 0 or h <= 0 or length <= 0:
            yield i, w, h, shadow, None
            continue
        data = f.read(length)
        try:
            raw = zlib.decompress(data, 16 + zlib.MAX_WBITS)
        except Exception:
            try:
                raw = zlib.decompress(data)
            except Exception:
                yield i, w, h, shadow, None
                continue
        if shadow >> 7:
            # mask layer follows; skip it
            pass
        yield i, w, h, shadow, raw
    f.close()


def to_image(w, h, raw):
    arr = np.frombuffer(raw, dtype=np.uint8)
    need = w * h * 4
    if arr.size < need:
        return None
    arr = arr[:need].reshape(h, w, 4)
    # BGRA -> RGBA
    rgba = arr[:, :, [2, 1, 0, 3]].copy()
    return Image.frombytes('RGBA', (w, h), rgba.tobytes())


def export_lib(lib_path, out_dir, sheet_dir, cell=64, per_sheet=64, only=None):
    name = os.path.splitext(os.path.basename(lib_path))[0]
    od = os.path.join(out_dir, name)
    os.makedirs(od, exist_ok=True)
    os.makedirs(sheet_dir, exist_ok=True)
    cells = []
    stats = {'total': 0, 'empty': 0, 'exported': 0}
    sheet_no = 0

    def flush():
        nonlocal cells, sheet_no
        if not cells:
            return
        cols = 8
        rows = (len(cells) + cols - 1) // cols
        pad = 4
        W = cols * (cell + pad) + pad
        H = rows * (cell + pad + 14) + pad
        sheet = Image.new('RGB', (W, H), (24, 24, 28))
        d = ImageDraw.Draw(sheet)
        for k, (idx, img) in enumerate(cells):
            cx = pad + (k % cols) * (cell + pad)
            cy = pad + (k // cols) * (cell + pad + 14)
            if img is not None:
                im = img.copy()
                im.thumbnail((cell, cell))
                ox = cx + (cell - im.width) // 2
                oy = cy + (cell - im.height) // 2
                sheet.paste(im, (ox, oy), im)
            d.text((cx + 2, cy + cell + 1), str(idx), fill=(255, 220, 120))
        p = os.path.join(sheet_dir, f'{name}_sheet{sheet_no:03d}.png')
        sheet.save(p)
        print('sheet', p, len(cells))
        sheet_no += 1
        cells = []

    for idx, w, h, shadow, raw in read_lib_frames(lib_path):
        stats['total'] += 1
        if only is not None and idx not in only:
            continue
        if raw is None:
            stats['empty'] += 1
            continue
        img = to_image(w, h, raw)
        if img is None:
            stats['empty'] += 1
            continue
        img.save(os.path.join(od, f'{idx:05d}_{w}x{h}.png'))
        stats['exported'] += 1
        cells.append((idx, img))
        if len(cells) >= per_sheet:
            flush()
    flush()
    print(f'{name}: total={stats["total"]} exported={stats["exported"]} empty={stats["empty"]}')
    return stats


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('lib')
    ap.add_argument('--out', default=r'C:\Users\sjy\mir2-test\tools\lib-frames')
    ap.add_argument('--sheets', default=r'C:\Users\sjy\mir2-test\tools\lib-sheets')
    ap.add_argument('--cell', type=int, default=64)
    ap.add_argument('--per-sheet', type=int, default=64)
    a = ap.parse_args()
    export_lib(a.lib, a.out, a.sheets, a.cell, a.per_sheet)
