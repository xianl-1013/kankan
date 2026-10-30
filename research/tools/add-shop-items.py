# -*- coding: utf-8 -*-
"""把新人系列装备挂到比奇城各商人的 [Trade] 段（保持 UTF-8 BOM + CRLF）。"""
import sys, os, shutil

sys.stdout.reconfigure(encoding='utf-8')
BASE = r'C:\Users\sjy\mir2-test\Crystal\Build\Server\Release\Envir\NPCs\BichonProvince\BichonWall'
BAK = os.path.join(BASE, '_shopbak')

# 文件名 -> 要追加的商品行
ADD = {
    'Clothing-0106.txt': ['新人战盔', '新人神甲', '新人战带', '新人战靴'],
    'Necklace-0105.txt': ['新人战链'],
    'Bracelet-0105.txt': ['新人战镯'],
    'Ring-0105.txt': ['新人战戒'],
    'Blacksmith-0.txt': ['新人神剑'],
}


def read_lines(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return f.read()


def write_text(path, text):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        f.write(text)


def insert_into_trade(text, items):
    """在 [Trade] 段末尾插入 items。没有 [Trade] 段则在 [Types] 前或文件末尾新建。"""
    nl = '\r\n' if '\r\n' in text else '\n'
    lines = text.split(nl)
    lower = [l.strip().upper() for l in lines]

    if '[TRADE]' in lower:
        start = lower.index('[TRADE]')
        end = len(lines)
        for i in range(start + 1, len(lines)):
            if lines[i].strip().startswith('['):
                end = i
                break
        # 找到段内最后一个非空行
        last = start
        for i in range(start + 1, end):
            if lines[i].strip():
                last = i
        new = items + ([''] if end < len(lines) else [])
        lines[last + 1:last + 1] = new
        return nl.join(lines), f'在 [Trade] 末尾插入 {len(items)} 项'

    # 无 [Trade]：在 [Quests] 前插入，否则追加到末尾
    block = ['[Trade]'] + items + ['']
    if '[QUESTS]' in lower:
        idx = lower.index('[QUESTS]')
        lines[idx:idx] = block
        return nl.join(lines), f'新建 [Trade] 段（[Quests] 前）插入 {len(items)} 项'
    if not lines[-1].strip():
        lines[-1:-1] = block
    else:
        lines += [''] + block
    return nl.join(lines), f'新建 [Trade] 段（文件末尾）插入 {len(items)} 项'


def add_blacksmith_menu(text):
    """给铁匠主菜单加购买入口与 [@BuySell] 页。"""
    if '@BUYSELL' in text.upper():
        return text, '已存在 [@BuySell]，跳过菜单'
    nl = '\r\n' if '\r\n' in text else '\n'
    old = '<特殊修理/@SRepair> 武器.'
    if old not in text:
        return text, '未找到修理菜单行，跳过'
    new = '<购买武器/@BuySell> 商店.' + nl + old
    text = text.replace(old, new, 1)
    page = (nl + '[@BuySell]' + nl + '#SAY' + nl + '你要买卖什么东西?' + nl +
            '<买回/@BuyBack>' + nl + ' ' + nl + '<返回/@main>' + nl +
            nl + '[@BuyBack]' + nl + '#SAY' + nl +
            '如果你不离线，那么你卖出的东西就可以买回去.' + nl + ' ' + nl + '<返回/@main>' + nl)
    # 插到 [Types] 之前
    idx = text.upper().find('[TYPES]')
    if idx < 0:
        text = text + page
    else:
        text = text[:idx] + page + nl + text[idx:]
    return text, '已加购买菜单和 [@BuySell] 页'


def main():
    os.makedirs(BAK, exist_ok=True)
    for fn, items in ADD.items():
        path = os.path.join(BASE, fn)
        if not os.path.exists(path):
            print(f'!! 缺少文件 {fn}')
            continue
        shutil.copy2(path, os.path.join(BAK, fn))
        text = read_lines(path)
        text, msg1 = insert_into_trade(text, items)
        if fn == 'Blacksmith-0.txt':
            text, msg2 = add_blacksmith_menu(text)
        else:
            msg2 = ''
        write_text(path, text)
        print(f'{fn}: {msg1} {msg2} -> {items}')


if __name__ == '__main__':
    main()
