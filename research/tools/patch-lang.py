import json, io, sys, collections

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
p = r'C:\Users\sjy\mir2-test\Crystal\Client\Localization\Chinese.json'
d = json.load(open(p, encoding='utf-8-sig'), object_pairs_hook=collections.OrderedDict)
t = d['Text']

new = {
    'StoragePasswordPrompt': '请输入仓库密码。',
    'StoragePasswordCurrentPrompt': '请输入当前仓库密码。',
    'StoragePasswordNewPrompt': '请输入新仓库密码。',
    'StoragePasswordConfirmPrompt': '请再次输入新仓库密码。',
    'StoragePasswordMismatch': '两次输入的密码不一致。',
    'StoragePasswordManagePrompt': '要修改或移除仓库密码吗？',
    'StoragePasswordSetSuccess': '仓库密码已设置。',
    'StoragePasswordChangeSuccess': '仓库密码已修改。',
    'StoragePasswordRemoveSuccess': '仓库密码已移除。',
    'StoragePasswordWrong': '仓库密码错误。',
    'StoragePasswordNotAcceptable': '该密码不符合要求。',
    'StoragePasswordUnavailable': '仓库不可用。',
    'StoragePasswordNoPasswordSet': '尚未设置仓库密码。',
    'StoragePasswordLastSetLabel': '仓库密码设置时间：{0}',
    'StoragePasswordRules': '密码长度需为 {0}-{1} 个字符，只能包含字母和数字。',
    'StoragePasswordChangePrompt': '要修改仓库密码吗？',
    'StoragePasswordRemovePrompt': '要移除仓库密码吗？',
    'DeleteItemAmountPrompt': '要丢弃多少个 {0}？',
    'DeleteItemConfirmPrompt': '你确定要丢弃 {0} 吗？',
    'FailedCloseAutoPatcherUpdate': '关闭自动更新失败。',
}

added = []
for k, v in new.items():
    if k not in t:
        t[k] = v
        added.append(k)
    else:
        print('exists:', k, '=', t[k])

# fix known bad values
fixes = {
    'ItemTypeDeco': '装饰',
    'FireballSkillDescription': '火球术\n\n瞬发技能\n法力消耗 {2}\n\n汇聚火元素形成火球，投掷给怪物造成伤害。\n\n当前技能等级 {0}\n下一等级 {1}',
    'ThunderboltSkillDescription': '雷电术\n\n瞬发技能\n法力消耗 {2}\n\n召来雷霆击打敌人，造成高额伤害。\n\n当前技能等级 {0}\n下一等级 {1}',
}
for k, v in fixes.items():
    if k in t:
        old = t[k]
        t[k] = v
        print('fixed:', k, '| old:', repr(old[:60]))

print('added:', len(added), added)
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('written', p)
