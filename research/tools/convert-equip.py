# -*- coding: utf-8 -*-
"""把怒战 cfg_equip / cfg_item 转成 Crystal ItemInfo 格式，输出 CSV 预览（只读，不改数据库）。"""
import json, io, sys, os, csv, re, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'C:\Users\sjy\mir2-test'
CFG = os.path.join(ROOT, 'shuangfu-cache', 'config')
OUT = os.path.join(ROOT, 'tools', 'convert')
os.makedirs(OUT, exist_ok=True)

# ---------- Crystal enums ----------
ITEM_TYPE = {
    0: 'Nothing', 1: 'Weapon', 2: 'Armour', 4: 'Helmet', 5: 'Necklace', 6: 'Bracelet',
    7: 'Ring', 8: 'Amulet', 9: 'Belt', 10: 'Boots', 11: 'Stone', 12: 'Torch',
    13: 'Potion', 14: 'Ore', 15: 'Meat', 16: 'CraftingMaterial', 17: 'Scroll',
    18: 'Gem', 19: 'Mount', 20: 'Book', 21: 'Script', 34: 'Quest', 38: 'Deco',
}

# ---------- StdMode -> Crystal ItemType ----------
EQUIP_MODE = {
    5: 1,    # 武器
    10: 2,   # 男衣
    11: 2,   # 女衣
    15: 4,   # 头盔
    19: 5,   # 项链
    26: 6,   # 手镯
    22: 7,   # 戒指
    64: 9,   # 腰带
    62: 10,  # 靴子
    30: 20,  # 技能书
    166: 17, # 等级提升卷
    168: 0,  # 斗帝神装：按名字判断
    288: 1,  # 时装武器
    84: 38,  # 勋章 -> 装饰
    16: 8,   # 「玫メ瑰」特殊饰品
    28: 8,   # 「魔メ念」
    51: 8,   # 「仙メ魄」
    63: 8,   # 「龙メ魂」
    65: 8,   # 「神メ格」
    93: 8,   # 「盾メ牌」
    50: 18,  # 寒冰异火 -> 宝石
    68: 1,   # 魔器 -> 武器
    75: 38,  # 精灵 -> 装饰
    83: 38,  # 神威战旗
    86: 38,  # 山河图
    88: 8,   # 玄武玉佩
    90: 8,   # 朱雀龙珠
    91: 8,   # 青龙玉玺
    92: 8,   # 白虎虎符
    271: 38, # 青龙之力
    289: 1,  # 神农尺
    290: 1,  # 轩辕剑
    291: 1,  # 少昊戟
    292: 1,  # 颛顼刀
    315: 6,  # 腕
    318: 7,  # 指
    319: 9,  # 腰
    400: 38, # 印记
    272: 38, 273: 38, 274: 38, 275: 38, 276: 38, 277: 38, 278: 38,
    279: 38, 280: 38, 281: 38, 282: 38, 283: 38,
    284: 38, 285: 38, 286: 38, 287: 38,
}
ITEM_MODE = {
    31: 13,  # 消耗品
    42: 16,  # 材料
    41: 21,  # 货币 -> Script
    44: 34,  # 任务
    2: 17,   # 修复 -> Scroll
}

# 部位关键词 -> ItemType（用于 StdMode 缺失/168 类）
PART_KEYWORD = [
    ('盔', 4), ('链', 5), ('镯', 6), ('戒', 7), ('带', 9), ('靴', 10),
    ('甲', 2), ('衣', 2), ('剑', 1), ('刀', 1), ('枪', 1), ('斧', 1), ('武器', 1),
    ('神装', 2),
]

# ---------- Attribute 解析 ----------
def parse_attr(s):
    """'3#1#100000|3#2#100000' -> [(grp, id, value), ...]"""
    out = []
    if not s:
        return out
    for part in str(s).split('|'):
        bits = part.split('#')
        if len(bits) == 3:
            try:
                out.append((int(bits[0]), int(bits[1]), int(bits[2])))
            except ValueError:
                pass
        elif len(bits) == 2:
            try:
                out.append((0, int(bits[0]), int(bits[1])))
            except ValueError:
                pass
    return out


def to_int(v, default=0):
    try:
        if v is None or v == '':
            return default
        return int(float(v))
    except (TypeError, ValueError):
        return default


def guess_type(name, fallback):
    if fallback:
        return fallback
    for kw, t in PART_KEYWORD:
        if kw in name:
            return t
    return 0


def convert(d, is_equip):
    rows = []
    skipped = []
    for k, v in d.items():
        if not isinstance(v, dict):
            continue
        name = (v.get('Name') or '').strip()
        if not name or re.match(r'^[━─\-—=＝\s]+', name) or name.startswith('-----'):
            skipped.append((k, name or '(empty)', '分隔符/空名'))
            continue
        mode = to_int(v.get('StdMode'), -1)
        table = EQUIP_MODE if is_equip else ITEM_MODE
        ctype = table.get(mode)
        if ctype is None:
            # 未映射：靠名字猜
            ctype = guess_type(name, 0)
        elif ctype == 0 and is_equip:
            ctype = guess_type(name, 2)
        attrs = parse_attr(v.get('Attribute'))
        rows.append({
            'source_idx': to_int(v.get('Idx'), to_int(k)),
            'name': name,
            'std_mode': mode,
            'crystal_type_id': ctype,
            'crystal_type': ITEM_TYPE.get(ctype, 'Nothing'),
            'shape': to_int(v.get('Shape')),
            'looks': to_int(v.get('Looks')),
            'dura': to_int(v.get('DuraMax')),
            'price': to_int(v.get('Price')),
            'need_level': to_int(v.get('NeedLevel')),
            'job': to_int(v.get('Job')),
            'attr_raw': v.get('Attribute') or '',
            'attr_count': len(attrs),
            'attr_ids': ','.join(str(a[1]) for a in attrs),
            'desc': (v.get('Desc') or '')[:60],
        })
    return rows, skipped


def write_csv(rows, path, cols):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, '') for c in cols})


def main():
    eq = json.load(open(os.path.join(CFG, 'cfg_equip.json'), encoding='utf-8-sig'))
    it = json.load(open(os.path.join(CFG, 'cfg_item.json'), encoding='utf-8-sig'))
    eq_rows, eq_skip = convert(eq, True)
    it_rows, it_skip = convert(it, False)
    cols = ['source_idx', 'name', 'std_mode', 'crystal_type_id', 'crystal_type', 'shape', 'looks',
            'dura', 'price', 'need_level', 'job', 'attr_count', 'attr_ids', 'attr_raw', 'desc']
    write_csv(eq_rows, os.path.join(OUT, 'equip-preview.csv'), cols)
    write_csv(it_rows, os.path.join(OUT, 'item-preview.csv'), cols)

    print('=== 装备 ===')
    print('  可转换:', len(eq_rows), ' 跳过(分隔符/空):', len(eq_skip))
    c = collections.Counter((r['std_mode'], r['crystal_type']) for r in eq_rows)
    for (mode, t), n in c.most_common(20):
        print(f'   StdMode {mode:>4} -> {t:<16} {n:5d}')
    print('=== 物品 ===')
    print('  可转换:', len(it_rows), ' 跳过:', len(it_skip))
    c2 = collections.Counter((r['std_mode'], r['crystal_type']) for r in it_rows)
    for (mode, t), n in c2.most_common(10):
        print(f'   StdMode {mode:>4} -> {t:<16} {n:5d}')
    print()
    print('未映射 StdMode (装备):', sorted(set(r['std_mode'] for r in eq_rows if r['crystal_type'] == 'Nothing')))
    print('属性ID分布:', collections.Counter(
        a for r in eq_rows for a in r['attr_ids'].split(',') if a).most_common(20))
    print()
    print('CSV:', os.path.join(OUT, 'equip-preview.csv'))
    print('CSV:', os.path.join(OUT, 'item-preview.csv'))


if __name__ == '__main__':
    main()
