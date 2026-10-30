import json, io, sys, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
base = r'C:\Users\sjy\mir2-test\shuangfu-extract\ui-assets'
m = json.load(open(os.path.join(base, 'ui-index-map.json'), encoding='utf-8'))
used = set(x['h5']['path'] for x in m['mappings'])
root = os.path.join(base, 'files')
files = set()
for r, ds, fs in os.walk(root):
    for f in fs:
        p = os.path.relpath(os.path.join(r, f), root).replace(os.sep, '/')
        files.add(p)
print('mapped assets:', len(used), 'total files:', len(files))
unused = sorted(files - used)
print('unused:', len(unused))
for u in unused:
    print('  ', u)
