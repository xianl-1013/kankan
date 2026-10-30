# -*- coding: utf-8 -*-
"""生成怒战风格的 Crystal UI 皮肤帧（暗色 + 金边 + 红色点缀）。

输出 PNG 供 LibFrameReplace 写回 .Lib。
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'C:\Users\sjy\mir2-test'
OUT = os.path.join(ROOT, r'tools\convert\ui-skin')
os.makedirs(OUT, exist_ok=True)

GOLD = (212, 175, 55)
GOLD_LT = (255, 224, 130)
GOLD_DK = (120, 90, 20)
RED = (198, 40, 40)
RED_LT = (255, 90, 60)
BG0 = (8, 10, 18)
BG1 = (18, 22, 38)
BG2 = (30, 26, 20)


def load_font(size, bold=True):
    for name in ('msyhbd.ttc', 'msyh.ttc', 'simhei.ttf', 'simsun.ttc'):
        for base in (r'C:\Windows\Fonts',):
            p = os.path.join(base, name)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
    return ImageFont.load_default()


def radial_bg(w, h, c_in, c_out):
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w * 0.5, h * 0.46
    d = np.sqrt(((xx - cx) / (w * 0.75)) ** 2 + ((yy - cy) / (h * 0.75)) ** 2)
    t = np.clip(d, 0, 1)[..., None]
    a = np.array(c_in, dtype=np.float32)
    b = np.array(c_out, dtype=np.float32)
    rgb = a * (1 - t) + b * t
    return Image.fromarray(rgb.astype(np.uint8), 'RGB')


def add_noise(im, amount=6):
    arr = np.array(im).astype(np.int16)
    noise = np.random.randint(-amount, amount + 1, arr.shape[:2])[..., None]
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGB')


def draw_glow_circle(size, radius, color, width, blur):
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = size // 2
    d.ellipse([c - radius, c - radius, c + radius, c + radius], outline=color, width=width)
    return layer.filter(ImageFilter.GaussianBlur(blur))


def make_login_bg(w=1024, h=768):
    """登录背景：暗色径向渐变 + 中央光环 + 中式云纹边角 + 标题。"""
    base = radial_bg(w, h, (26, 20, 46), BG0).convert('RGBA')
    base = add_noise(base.convert('RGB'), 4).convert('RGBA')

    # 暗红氛围光（上方）
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w * 0.15, -h * 0.35, w * 0.85, h * 0.55], fill=(120, 20, 24, 60))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    base.alpha_composite(glow)

    # 标题光环（顶部区域，避免与居中登录面板重叠）
    cx, cy = w // 2, int(h * 0.165)
    R = 118
    ring = draw_glow_circle(R * 2 + 90, R, GOLD_LT + (190,), 3, 16)
    base.alpha_composite(ring, (cx - (R * 2 + 90) // 2, cy - (R * 2 + 90) // 2))
    ring2 = draw_glow_circle(R * 2 + 90, R - 12, GOLD + (120,), 2, 7)
    base.alpha_composite(ring2, (cx - (R * 2 + 90) // 2, cy - (R * 2 + 90) // 2))

    inner = Image.new('RGBA', (R * 2, R * 2), (0, 0, 0, 0))
    ImageDraw.Draw(inner).ellipse([0, 0, R * 2, R * 2], fill=(12, 8, 18, 225))
    base.alpha_composite(inner, (cx - R, cy - R))

    d = ImageDraw.Draw(base)
    f1 = load_font(78)
    title = '怒战传奇'
    bbox = d.textbbox((0, 0), title, font=f1)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx, ty = cx - tw // 2 - bbox[0], cy - th // 2 - bbox[1]
    d.text((tx, ty), title, font=f1, fill=(120, 18, 18, 170), stroke_width=7,
           stroke_fill=(50, 6, 8, 200))
    d.text((tx, ty), title, font=f1, fill=GOLD_LT, stroke_width=2,
           stroke_fill=(80, 16, 12, 255))

    f2 = load_font(22)
    sub = '经 典 · 爽 服 · 高 爆'
    bbox2 = d.textbbox((0, 0), sub, font=f2)
    sw = bbox2[2] - bbox2[0]
    d.text((cx - sw // 2, cy + 92), sub, font=f2, fill=(205, 172, 120, 230),
           stroke_width=1, stroke_fill=(16, 8, 8, 200))

    # 四角装饰：金线 L 角 + 云纹点
    def corner(ox, oy, sx, sy):
        L = 150
        for i, col in enumerate([(GOLD_DK + (255,)), (GOLD_LT + (255,))]):
            off = i * 4
            d.line([(ox + sx * off, oy + sy * L), (ox + sx * off, oy + sy * off),
                    (ox + sx * L, oy + sy * off)], fill=col, width=3 if i else 5)
        for k in range(5):
            px = ox + sx * (24 + k * 26)
            py = oy + sy * (24 + k * 26)
            r = 4 + (k % 3) * 2
            d.ellipse([px - r, py - r, px + r, py + r], fill=GOLD + (170,))

    m = 26
    corner(m, m, 1, 1)
    corner(w - m, m, -1, 1)
    corner(m, h - m, 1, -1)
    corner(w - m, h - m, -1, -1)

    # 底部渐隐暗带（放版本号）
    bar = Image.new('RGBA', (w, 90), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    for y in range(90):
        a = int(150 * (y / 89) ** 1.6)
        bd.line([(0, y), (w, y)], fill=(0, 0, 0, a))
    base.alpha_composite(bar, (0, h - 90))

    out = os.path.join(OUT, 'ChrSel_0.png')
    base.convert('RGB').save(out, quality=95)
    print('saved', out, base.size)
    return base.size


def make_login_panel(w=328, h=220):
    """登录面板：深色玻璃底 + 双层金边 + 顶部渐变条。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # 外发光
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle([3, 3, w - 4, h - 4], radius=12,
                                           outline=(255, 200, 90, 150), width=6)
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))

    # 主体
    d.rounded_rectangle([4, 4, w - 5, h - 5], radius=10, fill=(12, 14, 24, 238))
    # 内层深色区
    d.rounded_rectangle([10, 10, w - 11, h - 11], radius=8, fill=(8, 9, 16, 250))

    # 顶部渐变条
    top = Image.new('RGBA', (w - 20, 34), (0, 0, 0, 0))
    td = ImageDraw.Draw(top)
    for y in range(34):
        a = int(190 * (1 - y / 33))
        td.line([(0, y), (w - 20, y)], fill=(140, 20, 26, a))
    im.alpha_composite(top, (10, 10))

    # 金边（外粗内细）
    d.rounded_rectangle([4, 4, w - 5, h - 5], radius=10, outline=GOLD_DK + (255,), width=3)
    d.rounded_rectangle([8, 8, w - 9, h - 9], radius=8, outline=GOLD + (210,), width=1)
    d.line([(12, 45), (w - 13, 45)], fill=GOLD_DK + (200,), width=1)

    # 四角金饰
    for ox, oy, sx, sy in ((8, 8, 1, 1), (w - 9, 8, -1, 1), (8, h - 9, 1, -1), (w - 9, h - 9, -1, -1)):
        d.line([(ox, oy + sy * 18), (ox, oy), (ox + sx * 18, oy)], fill=GOLD_LT + (255,), width=2)

    out = os.path.join(OUT, 'Prguse_1084.png')
    im.save(out)
    print('saved', out, im.size)
    return im.size


def make_title(text, w=102, h=24, fsize=None):
    """标题小条：金色描边红字。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = load_font(fsize or (h - 4))
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (w - tw) // 2 - bbox[0]
    y = (h - th) // 2 - bbox[1]
    d.text((x, y), text, font=f, fill=RED_LT, stroke_width=1, stroke_fill=(60, 10, 6, 255))
    return im


if __name__ == '__main__':
    make_login_bg()
    make_login_panel()
    # 预览拼图
    bg = Image.open(os.path.join(OUT, 'ChrSel_0.png')).convert('RGBA')
    panel = Image.open(os.path.join(OUT, 'Prguse_1084.png')).convert('RGBA')
    prev = bg.copy()
    prev.alpha_composite(panel, ((1024 - 328) // 2, (768 - 220) // 2))
    prev.convert('RGB').save(os.path.join(OUT, '_preview.png'))
    print('preview ->', os.path.join(OUT, '_preview.png'))


# ---------------- 按钮皮肤 ----------------
BTN_TEXT = {
    30: ('登录', 102, 24, 'title'),
    323: ('新建', 100, 25, 'norm'), 324: ('新建', 100, 25, 'hover'), 325: ('新建', 100, 25, 'press'),
    326: ('修改密码', 100, 25, 'norm'), 327: ('修改密码', 100, 25, 'hover'), 328: ('修改密码', 100, 25, 'press'),
    329: ('取消', 100, 25, 'norm'), 330: ('取消', 100, 25, 'hover'), 331: ('取消', 100, 25, 'press'),
    332: ('安全', 100, 25, 'norm'), 333: ('安全', 100, 25, 'hover'), 334: ('安全', 100, 25, 'press'),
    31: ('账号', 32, 20, 'label'), 32: ('密码', 32, 20, 'label'),
}


def make_button(text, w, h, state):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    if state == 'title':
        f = load_font(h - 3)
        bbox = d.textbbox((0, 0), text, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (w - tw) // 2 - bbox[0]
        y = (h - th) // 2 - bbox[1]
        d.text((x, y), text, font=f, fill=GOLD_LT, stroke_width=1, stroke_fill=(70, 12, 10, 255))
        return im

    if state == 'label':
        f = load_font(h - 4)
        bbox = d.textbbox((0, 0), text, font=f)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (w - tw) // 2 - bbox[0]
        y = (h - th) // 2 - bbox[1]
        d.text((x, y), text, font=f, fill=(215, 190, 140, 255), stroke_width=1,
               stroke_fill=(10, 8, 6, 220))
        return im

    palette = {
        'norm':  ((26, 22, 34, 240), GOLD_DK + (255,), GOLD_LT + (255,)),
        'hover': ((52, 38, 22, 250), GOLD_LT + (255,), (255, 240, 190, 255)),
        'press': ((14, 10, 16, 250), (90, 66, 16, 255), (190, 150, 60, 255)),
    }
    bg, border, fg = palette[state]

    if state == 'hover':
        glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(glow).rounded_rectangle([1, 1, w - 2, h - 2], radius=5,
                                               outline=(255, 200, 90, 180), width=4)
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(4)))

    d.rounded_rectangle([1, 1, w - 2, h - 2], radius=5, fill=bg, outline=border, width=2)
    # 顶部高光
    hi = Image.new('RGBA', (w - 8, max(3, h // 5)), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    for y in range(hi.height):
        a = int(60 * (1 - y / max(1, hi.height - 1)))
        hd.line([(0, y), (hi.width, y)], fill=(255, 230, 170, a))
    im.alpha_composite(hi, (4, 3))

    f = load_font(min(h - 8, 18))
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (w - tw) // 2 - bbox[0]
    y = (h - th) // 2 - bbox[1]
    d.text((x, y), text, font=f, fill=fg, stroke_width=1, stroke_fill=(12, 8, 6, 230))
    return im


def make_check_button(w=48, h=48, state='norm'):
    """绿色对勾按钮 -> 金色对勾。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pal = {'norm': (34, 28, 20, 240), 'hover': (66, 48, 24, 250), 'press': (18, 14, 12, 250)}
    bg = pal[state]
    d.ellipse([3, 3, w - 4, h - 4], fill=bg, outline=GOLD_DK + (255,), width=2)
    if state == 'hover':
        glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse([2, 2, w - 3, h - 3], outline=(255, 210, 110, 200), width=4)
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(5)))
    col = GOLD_LT if state != 'press' else (190, 150, 60, 255)
    d.line([(w * 0.28, h * 0.52), (w * 0.44, h * 0.68), (w * 0.74, h * 0.32)],
           fill=col, width=max(3, w // 12))
    return im


def build_all_buttons():
    for idx, (text, w, h, state) in BTN_TEXT.items():
        make_button(text, w, h, state).save(os.path.join(OUT, f'Title_{idx}.png'))
    for i, st in ((320, 'norm'), (321, 'hover'), (322, 'press')):
        make_check_button(48, 48, st).save(os.path.join(OUT, f'Title_{i}.png'))
    print('buttons ->', sum(1 for _ in BTN_TEXT) + 3, 'frames')


# ---------------- 选角界面 ----------------
SELECT_BTN = {
    340: ('开始', 'norm'), 341: ('开始', 'hover'), 342: ('开始', 'press'),
    343: ('新建角色', 'norm'), 344: ('新建角色', 'hover'), 345: ('新建角色', 'press'),
    346: ('删除角色', 'norm'), 347: ('删除角色', 'hover'), 348: ('删除角色', 'press'),
    349: ('制作名单', 'norm'), 350: ('制作名单', 'hover'), 351: ('制作名单', 'press'),
    352: ('退出', 'norm'), 353: ('退出', 'hover'), 354: ('退出', 'press'),
}


def make_select_bg(w=1024, h=768):
    """选角界面：暗色渐变 + 金线顶/底条 + 右侧槽位框。"""
    base = radial_bg(w, h, (30, 22, 44), (6, 6, 12)).convert('RGBA')
    base = add_noise(base.convert('RGB'), 3).convert('RGBA')
    d = ImageDraw.Draw(base)

    # 顶部条
    top = Image.new('RGBA', (w, 46), (0, 0, 0, 0))
    td = ImageDraw.Draw(top)
    for y in range(46):
        a = int(235 - y * 1.6)
        td.line([(0, y), (w, y)], fill=(16, 14, 24, max(0, a)))
    base.alpha_composite(top, (0, 0))
    d.line([(0, 45), (w, 45)], fill=GOLD + (220,), width=2)
    d.line([(0, 48), (w, 48)], fill=(90, 66, 18, 140), width=1)

    # 底部条
    bot = Image.new('RGBA', (w, 34), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bot)
    for y in range(34):
        a = int(160 + y * 2.4)
        bd.line([(0, y), (w, y)], fill=(12, 10, 18, min(255, a)))
    base.alpha_composite(bot, (0, h - 34))
    d.line([(0, h - 35), (w, h - 35)], fill=GOLD + (200,), width=2)

    # 中部标题区装饰线
    d.line([(340, 45), (340, 60)], fill=(90, 66, 18, 150), width=1)
    d.line([(684, 45), (684, 60)], fill=(90, 66, 18, 150), width=1)

    # 右侧 4 个角色槽位
    slots = [(178, 246), (284, 352), (390, 458), (496, 572)]
    for (y0, y1) in slots:
        box = [624, y0, 932, y1]
        d.rounded_rectangle(box, radius=6, fill=(10, 12, 22, 225), outline=(120, 92, 26, 230), width=2)
        d.line([(box[0] + 8, box[1] + 3), (box[2] - 8, box[1] + 3)], fill=(255, 220, 150, 70), width=1)

    # 左下角色名输入区
    d.rounded_rectangle([198, 606, 378, 634], radius=4, fill=(12, 12, 22, 235),
                        outline=(110, 84, 22, 220), width=2)

    # 中央角色展示区底纹（径向压暗）
    halo = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([230, 150, 620, 620], fill=(60, 30, 90, 26))
    base.alpha_composite(halo.filter(ImageFilter.GaussianBlur(70)))

    out = os.path.join(OUT, 'Prguse_65.png')
    base.convert('RGB').save(out, quality=95)
    print('saved', out, base.size)


def make_char_frame(w=208, h=303):
    """角色展示框：深色底 + 双层金边 + 四角饰。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle([2, 2, w - 3, h - 3], radius=10,
                                           outline=(255, 200, 90, 120), width=5)
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(8)))
    d.rounded_rectangle([3, 3, w - 4, h - 4], radius=9, fill=(9, 10, 18, 210))
    d.rounded_rectangle([3, 3, w - 4, h - 4], radius=9, outline=GOLD_DK + (255,), width=3)
    d.rounded_rectangle([8, 8, w - 9, h - 9], radius=7, outline=GOLD + (170,), width=1)
    for ox, oy, sx, sy in ((8, 8, 1, 1), (w - 9, 8, -1, 1), (8, h - 9, 1, -1), (w - 9, h - 9, -1, -1)):
        d.line([(ox, oy + sy * 16), (ox, oy), (ox + sx * 16, oy)], fill=GOLD_LT + (255,), width=2)
    out = os.path.join(OUT, 'ChrSel_220.png')
    im.save(out)
    print('saved', out, im.size)


def build_select_ui():
    make_select_bg()
    make_char_frame()
    for idx, (text, st) in SELECT_BTN.items():
        make_button(text, 100, 25, st).save(os.path.join(OUT, f'Title_{idx}.png'))
    make_button('选择', 84, 19, 'title').save(os.path.join(OUT, 'Title_40.png'))
    print('select ui built')


# ---------------- HUD 血球 / 主面板 ----------------
def make_orbs(w=101, h=80):
    """左红血球 + 右蓝魔法球，暗金描边。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))

    def orb(size, c_dark, c_mid, c_light, cx):
        layer = Image.new('RGBA', (size[0], size[1]), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.ellipse([0, 0, size[0] - 1, size[1] - 1], fill=c_dark)
        # 径向渐变
        import math as _m
        for r in range(min(size) // 2, 0, -1):
            t = r / (min(size) / 2)
            col = tuple(int(c_mid[i] * (1 - t) + c_light[i] * t) for i in range(3))
            ox = (size[0] - r * 2) // 2
            oy = (size[1] - r * 2) // 2
            d.ellipse([ox, oy, ox + r * 2, oy + r * 2], outline=col + (255,), width=2)
        # 高光
        hi = Image.new('RGBA', size, (0, 0, 0, 0))
        ImageDraw.Draw(hi).ellipse([size[0] * 0.22, size[1] * 0.12,
                                    size[0] * 0.55, size[1] * 0.38], fill=(255, 255, 255, 70))
        layer.alpha_composite(hi.filter(ImageFilter.GaussianBlur(6)))
        # 金边
        ImageDraw.Draw(layer).ellipse([0, 0, size[0] - 1, size[1] - 1],
                                      outline=GOLD_DK + (255,), width=3)
        return layer

    half = (w - 1) // 2
    red = orb((half, h), (60, 4, 8), (150, 12, 18), (255, 60, 40), 0)
    blue = orb((w - half - 1, h), (6, 10, 60), (18, 40, 150), (60, 120, 255), 0)
    im.alpha_composite(red, (0, 0))
    im.alpha_composite(blue, (half + 1, 0))
    return im


def make_hud_panel(w, h):
    """底部 HUD 主面板：深色渐变 + 顶部金线 + 底部暗影。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        a = int(60 + 175 * t)
        d.line([(0, y), (w, y)], fill=(10, 10, 18, a))
    # 顶部金线
    d.line([(0, 1), (w, 1)], fill=GOLD_LT + (200,), width=1)
    d.line([(0, 3), (w, 3)], fill=(90, 66, 18, 150), width=1)
    # 内格线（分隔快捷栏区域）
    for x in range(0, w, 40):
        d.line([(x, h - 46), (x, h - 6)], fill=(70, 54, 18, 90), width=1)
    d.line([(0, h - 47), (w, h - 47)], fill=(90, 66, 18, 130), width=1)
    return im


def build_hud():
    make_orbs().save(os.path.join(OUT, 'Prguse_4.png'))
    for idx, w in ((0, 800), (1, 1024), (2, 1024)):
        make_hud_panel(w, 152).save(os.path.join(OUT, f'Prguse_{idx}.png'))
    print('hud frames built')


# ---------------- 怒战风格血球（蜂窝晶格） ----------------
def _hex_texture(w, h, scale=9, line=(255, 150, 150), alpha=90):
    """生成六边形蜂窝网格纹理（RGBA）。"""
    tex = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(tex)
    s = scale
    dx = s * 1.732
    for row in range(-1, h // s + 2):
        for col in range(-1, w // int(dx) + 2):
            cx = col * dx + (dx / 2 if row % 2 else 0)
            cy = row * s * 1.5
            pts = [(cx + s * math.cos(math.radians(60 * k)),
                    cy + s * math.sin(math.radians(60 * k))) for k in range(6)]
            d.polygon(pts, outline=line + (alpha,))
    return tex


def make_nz_orb(size, base_dark, base_mid, base_hot, glow):
    """单个球：径向渐变 + 蜂窝纹理 + 高光 + 金边。"""
    w, h = size
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))

    # 径向渐变球体
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w * 0.5, h * 0.52
    d = np.sqrt(((xx - cx) / (w * 0.52)) ** 2 + ((yy - cy) / (h * 0.52)) ** 2)
    t = np.clip(d, 0, 1)[..., None]
    a = np.array(base_hot, dtype=np.float32)
    b = np.array(base_dark, dtype=np.float32)
    rgb = a * (1 - t) ** 1.6 + b * (t ** 1.2)
    body = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')

    # 蜂窝纹理（叠加）
    tex = _hex_texture(w, h, scale=max(6, w // 6), line=glow, alpha=110)
    body.alpha_composite(tex)

    # 左上高光
    hi = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(hi).ellipse([w * 0.18, h * 0.12, w * 0.52, h * 0.40],
                               fill=(255, 255, 255, 95))
    body.alpha_composite(hi.filter(ImageFilter.GaussianBlur(7)))

    # 遮罩：只保留椭圆
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse([1, 1, w - 2, h - 2], fill=255)
    im.paste(body, (0, 0), mask)

    # 金色描边
    ImageDraw.Draw(im).ellipse([1, 1, w - 2, h - 2], outline=(150, 118, 40, 255), width=3)
    ImageDraw.Draw(im).ellipse([4, 4, w - 5, h - 5], outline=(232, 196, 110, 170), width=1)
    return im


def make_nz_orbs(w=101, h=80):
    """怒战风血球：左红右蓝 + 金色分隔线。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    half = (w - 1) // 2
    red = make_nz_orb((half, h), (70, 2, 6), (150, 10, 14), (255, 46, 30), (255, 170, 160))
    blue = make_nz_orb((w - half - 1, h), (4, 8, 70), (20, 50, 160), (70, 140, 255), (170, 210, 255))
    im.alpha_composite(red, (0, 0))
    im.alpha_composite(blue, (half + 1, 0))
    # 中间金色分隔线
    d = ImageDraw.Draw(im)
    d.line([(half, 3), (half, h - 4)], fill=(190, 152, 60, 255), width=2)
    d.line([(half + 1, 3), (half + 1, h - 4)], fill=(120, 90, 30, 200), width=1)
    return im


def build_nz_hud():
    make_nz_orbs().save(os.path.join(OUT, 'Prguse_4_nz.png'))
    im = Image.open(os.path.join(OUT, 'Prguse_4_nz.png'))
    im.resize((im.width * 3, im.height * 3), Image.LANCZOS).save(os.path.join(OUT, '_orbs_nz_preview.png'))
    print('nz orbs built')
