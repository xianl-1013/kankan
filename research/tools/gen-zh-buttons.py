import sys, io, os, json, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, r'C:\Users\sjy\mir2-test\tools')
from button_maker import remake

ROOT = r'C:\Users\sjy\mir2-test'
mapping = json.load(open(os.path.join(ROOT, 'tools', 'zh-buttons.json'), encoding='utf-8'))
out_root = os.path.join(ROOT, 'tools', 'zh-buttons')
os.makedirs(out_root, exist_ok=True)

made, skipped = [], []
for lib, items in mapping.items():
    od = os.path.join(out_root, lib)
    os.makedirs(od, exist_ok=True)
    for idx_s, text in items.items():
        idx = int(idx_s)
        g = glob.glob(os.path.join(ROOT, 'tools', 'lib-frames-used', lib, f'{idx:05d}_*.png'))
        if not g:
            skipped.append((lib, idx, 'no source frame'))
            continue
        src = g[0]
        out = os.path.join(od, f'{idx:05d}.png')
        try:
            info = remake(src, text, out)
            made.append((lib, idx, text, info))
        except Exception as e:
            skipped.append((lib, idx, repr(e)))

print('made:', len(made), 'skipped:', len(skipped))
for s in skipped[:20]:
    print('  skip', s)
json.dump([{'lib': l, 'idx': i, 'text': t, 'info': {k: (str(v) if not isinstance(v, (int, str, float)) else v) for k, v in inf.items()}}
           for l, i, t, inf in made], open(os.path.join(ROOT, 'tools', 'zh-buttons-manifest.json'), 'w'), ensure_ascii=False, indent=1)
