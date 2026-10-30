#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 data_dev_ResSize.json 里列出的所有怒战素材下载到 h5client/public/res/data/"""
import json, os, sys, time, urllib.request, concurrent.futures

CDN = 'https://h5cdn-hs.dhsf.xqhuyu.com/219298/data/'
BASE = r'C:\Users\sjy\mir2-test\h5client\public\res\data'
SIZE = r'C:\Users\sjy\mir2-test\nz-ui\data_dev_ResSize.json'

d = json.load(open(SIZE, encoding='utf-8'))
todo = []
for k, wh in d.items():
    if wh[0] <= 1 and wh[1] <= 1:      # 1x1 占位图跳过
        continue
    dst = os.path.join(BASE, k.replace('/', os.sep))
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        continue
    todo.append(k)
print(f'待下载 {len(todo)} 个', flush=True)

done = [0]
fail = []

def get(k):
    dst = os.path.join(BASE, k.replace('/', os.sep))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(CDN + k, headers={'User-Agent': 'Mozilla/5.0'})
            data = urllib.request.urlopen(req, timeout=25).read()
            if data:
                open(dst, 'wb').write(data)
                done[0] += 1
                if done[0] % 200 == 0:
                    print(f'  {done[0]}/{len(todo)}', flush=True)
                return True
        except Exception:
            time.sleep(0.4 * (attempt + 1))
    fail.append(k)
    return False

with concurrent.futures.ThreadPoolExecutor(max_workers=40) as ex:
    list(ex.map(get, todo))

print(f'完成 {done[0]}/{len(todo)}  失败 {len(fail)}', flush=True)
if fail:
    open(r'C:\Users\sjy\mir2-test\tools\download-fail.txt', 'w', encoding='utf-8').write('\n'.join(fail))
    print('失败清单写入 tools/download-fail.txt', flush=True)
