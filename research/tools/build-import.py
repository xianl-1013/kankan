# -*- coding: utf-8 -*-
"""按怒战官方属性表(cfg_att_score.json)重建 import-all.json 的 stats 映射。

旧版把 ID 1-10 当成 MinAC..MaxSC，实测是错误的；
cfg_att_score.json 给出权威顺序：1=生命 2=魔法 3/4=攻击 5/6=魔法 7/8=道术 9/10=防御 11/12=魔防
"""
import json, sys, os, re, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'C:\Users\sjy\mir2-test'
CFG = os.path.join(ROOT, 'shuangfu-cache', 'config')
TOOLS = os.path.join(ROOT, 'tools')
CONV = os.path.join(TOOLS, 'convert')

# 怒战属性ID -> Crystal Stat 枚举值（仅保留语义明确的）
STAT_MAP = {
    1: 12,   # 生命值        -> HP
    2: 13,   # 魔法值        -> MP
    3: 4,    # 攻击下限      -> MinDC
    4: 5,    # 攻击上限      -> MaxDC
    5: 6,    # 魔法下限      -> MinMC
    6: 7,    # 魔法上限      -> MaxMC
    7: 8,    # 道术下限      -> MinSC
    8: 9,    # 道术上限      -> MaxSC
    9: 0,    # 防御下限      -> MinAC
    10: 1,   # 防御上限      -> MaxAC
    11: 2,   # 魔防下限      -> MinMAC
    12: 3,   # 魔防上限      -> MaxMAC
    13: 10,  # 准确          -> Accuracy
    14: 11,  # 敏捷          -> Agility
    15: 30,  # 魔法躲避      -> MagicResist
    16: 31,  # 毒物躲避      -> PoisonResist
    17: 34,  # 中毒恢复      -> PoisonRecovery
    18: 32,  # 体力恢复      -> HealthRecovery
    19: 33,  # 魔法恢复      -> SpellRecovery
    20: 14,  # 攻击速度      -> AttackSpeed
    21: 35,  # 物理暴击几率  -> CriticalRate
    22: 36,  # 暴击伤害增加  -> CriticalDamage
    29: 19,  # 所有伤害反弹  -> Reflect
    30: 46,  # 人物体力增加  -> HPRatePercent
    31: 47,  # 人物魔力增加  -> MPRatePercent
    34: 48,  # 吸血          -> HPDrainRatePercent
    36: 40,  # 防御加成      -> MaxACRatePercent
    37: 41,  # 魔防加成      -> MaxMACRatePercent
    38: 21,  # 神圣          -> Holy
    39: 15,  # 幸运          -> Luck
}

INT32_MAX = 2_000_000_000

EQUIP_MODE = {
    5: 1, 10: 2, 11: 2, 15: 4, 19: 5, 26: 6, 22: 7, 64: 9, 62: 10,
    30: 20, 166: 17, 168: 0, 288: 1, 84: 38, 16: 8, 28: 8, 51: 8, 63: 8,
    65: 8, 93: 8, 50: 18, 68: 1, 75: 38, 83: 38, 86: 38, 88: 8, 90: 8,
    91: 8, 92: 8, 271: 38, 289: 1, 290: 1, 291: 1, 292: 1, 315: 6, 318: 7,
    319: 9, 400: 38,
}
for _i in range(272, 288):
    EQUIP_MODE[_i] = 38
ITEM_MODE = {31: 13, 42: 16, 41: 21, 44: 34, 2: 17}

PART_KEYWORD = [
    ('盔', 4), ('链', 5), ('镯', 6), ('戒', 7), ('带', 9), ('靴', 10),
    ('甲', 2), ('衣', 2), ('剑', 1), ('刀', 1), ('枪', 1), ('斧', 1),
    ('武器', 1), ('神装', 2),
]


def parse_attr(s):
    out = []
    if not s:
        return out
    for part in str(s).split('|'):
        b = part.split('#')
        if len(b) == 3:
            try:
                out.append((int(b[0]), int(b[1]), int(b[2])))
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


# 爽服价格覆盖：让新人能直接买到起手装备
PRICE_OVERRIDE = {
    '新人战盔': 1000, '新人战链': 1000, '新人战镯': 1000, '新人战戒': 1000,
    '新人战带': 1000, '新人战靴': 1000, '新人神剑': 1500, '新人神甲': 1500,
    '新人扶持': 100, '超级祝福油': 500,
}

# 用追加进 Items.Lib 末尾的怒战图标（5380 起，见 tools/append-icons.py）
ICON_OVERRIDE = {
    '新人神剑': 5380,  # 剑-金
    '新人神甲': 5396,  # 蓝盾
    '新人战盔': 5395,  # 紫冠
    '新人战链': 5388,  # 令牌-红
    '新人战镯': 5397,  # 蓝纹
    '新人战戒': 5400,  # 紫玉
    '新人战带': 5393,  # 金纹
    '新人战靴': 5394,  # 绿纹
}


def build(d, is_equip, unknown_counter):
    rows = []
    for k, v in d.items():
        if not isinstance(v, dict):
            continue
        name = (v.get('Name') or '').strip()
        if not name or re.match(r'^[━─\-—=＝\s]+', name):
            continue
        mode = to_int(v.get('StdMode'), -1)
        table = EQUIP_MODE if is_equip else ITEM_MODE
        ctype = table.get(mode)
        if ctype is None:
            ctype = guess_type(name, 0)
        elif ctype == 0 and is_equip:
            ctype = guess_type(name, 2)

        stats = {}
        for (grp, aid, val) in parse_attr(v.get('Attribute')):
            if aid not in STAT_MAP:
                unknown_counter[aid] += 1
                continue
            stat = STAT_MAP[aid]
            if val > INT32_MAX:
                val = INT32_MAX
            elif val < -INT32_MAX:
                val = -INT32_MAX
            stats[str(stat)] = stats.get(str(stat), 0) + val

        rows.append({
            'source_idx': to_int(v.get('Idx'), to_int(k)),
            'name': name,
            'type': ctype,
            'image': ICON_OVERRIDE.get(name, to_int(v.get('Looks'))),
            'dura': to_int(v.get('DuraMax')),
            'price': PRICE_OVERRIDE.get(name, to_int(v.get('Price'))),
            'level': to_int(v.get('NeedLevel')),
            'job': to_int(v.get('Job')),
            'stats': stats,
        })
    return rows


def main():
    eq = json.load(open(os.path.join(CFG, 'cfg_equip.json'), encoding='utf-8-sig'))
    it = json.load(open(os.path.join(CFG, 'cfg_item.json'), encoding='utf-8-sig'))
    unknown = collections.Counter()
    eq_rows = build(eq, True, unknown)
    it_rows = build(it, False, unknown)
    rows = eq_rows + it_rows

    out = os.path.join(CONV, 'import-all.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False)

    print(f'写入 {out}')
    print(f'  装备 {len(eq_rows)} 件, 物品 {len(it_rows)} 件, 合计 {len(rows)}')
    print(f'  带属性条目 {sum(1 for r in rows if r["stats"])}')
    used = collections.Counter()
    for r in rows:
        for s in r['stats']:
            used[int(s)] += 1
    names = {0: 'MinAC', 1: 'MaxAC', 2: 'MinMAC', 3: 'MaxMAC', 4: 'MinDC', 5: 'MaxDC',
             6: 'MinMC', 7: 'MaxMC', 8: 'MinSC', 9: 'MaxSC', 10: 'Accuracy', 11: 'Agility',
             12: 'HP', 13: 'MP', 14: 'AttackSpeed', 15: 'Luck', 19: 'Reflect', 21: 'Holy',
             30: 'MagicResist', 31: 'PoisonResist', 32: 'HealthRecovery',
             33: 'SpellRecovery', 34: 'PoisonRecovery', 35: 'CriticalRate',
             36: 'CriticalDamage', 40: 'MaxACRate%', 41: 'MaxMACRate%',
             46: 'HPRate%', 47: 'MPRate%', 48: 'HPDrain%'}
    print('  Crystal 侧属性写入统计:')
    for s, n in sorted(used.items()):
        print(f'    Stat {s:>3} {names.get(s, "?"):<16} {n:>6} 条')
    print('  未映射的怒战属性ID(前20):', unknown.most_common(20))


if __name__ == '__main__':
    main()
