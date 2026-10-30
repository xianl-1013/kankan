# -*- coding: utf-8 -*-
"""给铁匠 Bill 加一个领取新人装备的对话页（GIVEITEM），并挂到主菜单。"""
import sys, os, shutil

sys.stdout.reconfigure(encoding='utf-8')
BASE = r'C:\Users\sjy\mir2-test\Crystal\Build\Server\Release\Envir\NPCs\BichonProvince\BichonWall'
FN = 'Blacksmith-0.txt'

GIFTS = ['新人战盔', '新人战链', '新人战镯', '新人战戒',
         '新人战带', '新人战靴', '新人神剑', '新人神甲', '新人扶持']

MENU_ANCHOR = '<购买武器/@BuySell> 商店.'
MENU_NEW = '<领取新手装备/@gift> 全套.\r\n' + MENU_ANCHOR


def main():
    path = os.path.join(BASE, FN)
    shutil.copy2(path, os.path.join(BASE, '_shopbak', FN + '.giftbak'))
    with open(path, encoding='utf-8-sig', newline='') as f:
        text = f.read()
    if '@GIFT' in text.upper():
        print('已存在 [@gift]，跳过')
        return
    nl = '\r\n' if '\r\n' in text else '\n'
    if MENU_ANCHOR not in text:
        print('!! 未找到菜单锚点'); return
    text = text.replace(MENU_ANCHOR, MENU_NEW.replace('\r\n', nl), 1)

    acts = nl.join('GIVEITEM ' + g for g in GIFTS)
    page = (nl + '[@gift]' + nl + '#SAY' + nl +
            '新来的勇士，这套装备是给你的见面礼。' + nl +
            '<领取/@gift2>' + nl + ' ' + nl + '<返回/@main>' + nl +
            nl + '[@gift2]' + nl + '#ACT' + nl + acts + nl + '#SAY' + nl +
            '装备已经放进你的背包，打开背包就能看到。' + nl +
            '<关闭/@exit>' + nl)
    idx = text.upper().find('[TYPES]')
    text = text[:idx] + page + nl + text[idx:] if idx >= 0 else text + page
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        f.write(text)
    print('已添加 [@gift] 领取页，共', len(GIFTS), '件')


if __name__ == '__main__':
    main()
