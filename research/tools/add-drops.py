# -*- coding: utf-8 -*-
"""给新手区低级怪物写入新人套掉落。

掉落行格式：<前缀2字符如 1/> + 概率分母 + 空格 + 物品名
分类 ; 开头的行只是注释，解析时跳过。
"""
import sys, os

sys.stdout.reconfigure(encoding='utf-8')
BASE = r'C:\Users\sjy\mir2-test\Crystal\Build\Server\Release\Envir\Drops'

TEMPLATE = """\
;Pots + Other
1/15 新人扶持

;Weapons
1/60 新人神剑

;Armour
1/60 新人神甲

;Helmets
1/40 新人战盔

;Necklace
1/40 新人战链

;Bracelets
1/40 新人战镯

;Rings
1/40 新人战戒

;Shoes
1/40 新人战靴

;Belts
1/40 新人战带

;Stone
"""

MOBS = ['Chick.txt', 'BabyPig.txt', 'Frog.txt', 'CharmedSnake.txt', 'FightingCat.txt']


def main():
    for fn in MOBS:
        path = os.path.join(BASE, fn)
        if not os.path.exists(path):
            print(f'!! 缺少 {fn}')
            continue
        # 原文件都是空模板，直接覆盖写入（备份已在 _dropbak）
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(TEMPLATE)
        print(f'{fn}: 写入 9 条掉落')
    print('done')


if __name__ == '__main__':
    main()
