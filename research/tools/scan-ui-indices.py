import re, os, io, sys, json, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
root = r'C:\Users\sjy\mir2-test\Crystal\Client'

block_re = re.compile(r'new\s+(Mir\w+)\s*\{(.*?)\}\s*;', re.S)
idx_re = re.compile(r'\bIndex\s*=\s*(\d+)')
lib_re = re.compile(r'Library\s*=\s*Libraries\.(\w+)')
draw_re = re.compile(r'Libraries\.(\w+)\.Draw\(\s*([\w\.\[\]]+)')
lib2_re = re.compile(r'Library\s*=\s*Libraries\.(\w+)')

used = collections.defaultdict(collections.Counter)   # lib -> idx -> count
dynamic = collections.defaultdict(set)                # lib -> expressions
files = 0
for r, ds, fs in os.walk(root):
    if '\\obj' in r or '\\bin' in r:
        continue
    for f in fs:
        if not f.endswith('.cs'):
            continue
        p = os.path.join(r, f)
        try:
            s = open(p, encoding='utf-8-sig').read()
        except Exception:
            continue
        files += 1
        # whole-file fallback: for each block, match index+library
        for m in block_re.finditer(s):
            body = m.group(2)
            idx = idx_re.search(body)
            lib = lib_re.search(body)
            if idx and lib:
                used[lib.group(1)][int(idx.group(1))] += 1
        # Draw calls
        for m in draw_re.finditer(s):
            lib, expr = m.group(1), m.group(2)
            if expr.isdigit():
                used[lib][int(expr)] += 1
            else:
                dynamic[lib].add(expr)

print('files scanned:', files)
for lib in sorted(used, key=lambda k: -len(used[k])):
    c = used[lib]
    print(f'{lib:12s} distinct={len(c):4d} refs={sum(c.values()):4d}')
    print('   ', sorted(c)[:200])
print()
print('=== dynamic index expressions ===')
for lib, exprs in dynamic.items():
    print(lib, len(exprs), sorted(exprs)[:30])

json.dump({k: sorted(v) for k, v in used.items()}, open(r'C:\Users\sjy\mir2-test\tools\ui-used-indices.json', 'w'), indent=1)
print('saved tools/ui-used-indices.json')
