import json, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
C = r'C:\Users\sjy\mir2-test\Crystal'

def load(p):
    return json.load(open(p, encoding='utf-8-sig'))

zh = load(C + r'\Client\Localization\Chinese.json')
en = load(C + r'\Client\Localization\English.json')
zht, ent = zh['Text'], en['Text']
same = [k for k in ent if zht.get(k) == ent[k]]
print('=== CLIENT zh==en (unchanged English) ===', len(same))
for k in same[:200]:
    print(f'  {k} = {ent[k]!r}')

missing = [k for k in ent if k not in zht]
print('=== MISSING keys in client zh ===', len(missing))
for k in missing:
    print(f'  {k} = {ent[k]!r}')

# Enum section
zhe, ene = zh.get('Enum', {}), en.get('Enum', {})
esame = [k for k in ene if zhe.get(k) == ene[k]]
print('=== CLIENT Enum zh==en ===', len(esame))
for k in esame[:100]:
    print(f'  {k} = {ene[k]!r}')
emiss = [k for k in ene if k not in zhe]
print('Enum missing:', len(emiss), emiss[:50])

# server
szh = load(C + r'\Build\Server\Release\Localization\Chinese.json')['Text']
sen = load(C + r'\Build\Server\Release\Localization\English.json')['Text']
smiss = [k for k in sen if k not in szh]
print('=== SERVER missing ===', len(smiss))
for k in smiss:
    print(f'  {k} = {sen[k]!r}')
