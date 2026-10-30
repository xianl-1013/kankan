# 怒战风格 H5 客户端

基于 Crystal 服务端（TCP 裸协议）+ 怒战美术资源的浏览器客户端。

## 启动

```bash
cd h5client
npm install      # 首次
node server/index.js
```

打开 http://127.0.0.1:8080

- 需要 Crystal 服务端在 `127.0.0.1:7000` 运行
- 调试自动登录：`http://127.0.0.1:8080/?acc=账号&pwd=密码&auto=1`
- 只渲染地图（不用登录）：http://127.0.0.1:8080/preview.html

## 怒战资源规则（逆向自 GMScript/bundle.js）

### CDN

```
https://h5cdn-hs.dhsf.xqhuyu.com/219298/
```

无防盗链，可直接 GET。

### 地图参数

```js
MAP = { WIDTH: 48, HEIGHT: 32, HALF_WIDTH: 24, HALF_HEIGHT: 16, GRID: 12 }
```

- 每格 **48×32 像素**
- 每瓦片 **12×12 格** = **576×384 像素**
- 地图尺寸来自 `data/mapbin/{组}.json` 的 `{w, h}`（单位：格）
- 瓦片数 = `ceil(w/12) × ceil(h/12)`

### 地图瓦片

```
data/map/{组}/{行:3位}{列:4位}.jpg
```

- 前 3 位 = 纵向瓦片索引（行）→ Y
- 后 4 位 = 横向瓦片索引（列）→ X
- 瓦片像素位置 = `(列 × 576, 行 × 384)`

例：`data/map/rr3/0020003.jpg` = 第 2 行第 3 列

### 已探明的地图组

| 组 | 尺寸(格) | 瓦片数 | 场景 |
|---|---|---|---|
| **`3x`** | **1000×800** | **84×67 = 5628** | **新手村（土路/木屋/石板广场）← 当前使用** |
| `rr3` | 90×72 | 8×6 = 48 | 云端仙宫（中央大法阵） |
| `rr2` | 待测 | — | 存在 |

**当前客户端加载的是 `3x`（怒战开局的新手村），出生点定在石板广场中心 `(330, 330)`。**

切换地图只需改 `app.js` 里的 `renderer.loadMap('3x')` 和出生点坐标。

### 大地图必须按需加载

`3x` 有 5628 块瓦片，全量预缩放约需 **1GB 内存**。所以 `TileCache` 改成：

- **按需加载**：只加载视口内的瓦片
- **LRU 淘汰**：上限 400 块，超了淘汰最久未用的 20%
- **CDN 回退**：本地没下载的瓦片直接从 CDN 拉

本地已缓存 1700+ 块（63MB），剩下的会自动从 CDN 取，不需要全量下载。

### 其他资源路径

```js
MAPURL:       "data/map/"
MAPBIN:       "data/mapbin/"       // 地图尺寸 + 遮挡数据
MATRIXURL:    "data/matrix/"       // 遮挡矩阵 {组}matrix.js
OFFSETURL:    "data/offset/"
OBJECTS:      "data/objects/"
EXTENDRES:    "data/dev/res/"
RES_PRIVATE:  "data/dev/res/private/"
MINIMAP:      "data/dev/scene/uiminimap/"
PLAYER_SHOW:  "data/dev/res/player_show/"
SKILL_ICON:   "data/dev/res/skill_icon/"
BUFF_ICON:    "data/dev/res/buff_icon/"
```

### 角色 / 怪物精灵

```
data/{player|monster|npc|weapon|wings}/{类别}_{ID}_{性别}/{动作}_{方向}.png
```

**重要：第二个数字是方向，不是帧号。** 把方向当帧循环播放会导致角色原地转圈。

- `_0` = 男，`_1` = 女（目录后缀）
- 文件名 `{动作}_{方向}.png`：
  - 第一个数字 = 动作：`0` 站立、`1` 行走、`2` 攻击、`3`、`5`、`11`
  - 第二个数字 = 方向 `0..7`（Up=0 顺时针到 UpLeft=7），与 MirDirection 一致
- 模型配置见 `config/cfg_model_info.json`（13753 条，`dir:8` = 8 方向）

### 图集切帧：必须用配套的 .json

**每张 PNG 都配一个同名 `.json`（标准 LayaAir 图集描述）：**

```
data/monster/monster_20133_0/1_0.png
data/monster/monster_20133_0/1_0.json   ← 帧数据在这里
```

```json
{
  "frames": {
    "00000.png": {
      "frame": {"x":0,"y":0,"w":275,"h":250},
      "spriteSourceSize": {"x":0,"y":0,"w":275,"h":250,"ox":-100,"oy":-196}
    }
  },
  "meta": {"image": "1_0.png"}
}
```

**不要用图像分析猜网格！** 图集布局不统一：

| 文件 | 尺寸 | 实际布局 |
|---|---|---|
| `0_3.png` | 473×624 | 2 列 × 2 行 = 4 帧 |
| `1_3.png` | 620×787 | 2 列 × 3 行 = 6 帧 |
| `2_3.png` | 1158×1165 | 列分割在 659 不是中点 |

写死 2×2 会让一格装进「一个半」角色，画面上就是**一个格子里两个分身**；
用透明行/列自动检测也不可靠（角色的披风、剑光会越过分割线）。

正确绘制：

```js
const s = (targetHeight * zoom) / 中位帧高;      // 整张图集共用一个缩放
ctx.drawImage(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h,
              px + ss.ox * s, py + ss.oy * s, f.frame.w * s, f.frame.h * s);
```

`ox / oy` 是官方算好的每帧锚点偏移，用它才能保证动画帧对齐、不抖不飘。

### 动画帧率

来自 `cfg_model_info.json` 的 `*_interval`（秒/帧）：

| 动作 | interval | 帧率 |
|---|---|---|
| 站立 idle | 0.25 | 4 fps |
| 行走 walk | 0.09 | 11 fps |
| 攻击 attack | 0.085 | 12 fps |

### 批量下载图集描述

```bash
python tools/nz-download-atlas.py data/monster   # 92 张，全部有对应 json
python tools/nz-download-atlas.py data/npc
```

## Crystal 协议对接

### 客户端 → 服务端

| 包 | ID | 载荷 |
|---|---|---|
| ClientVersion | 0 | `int32 len + md5(Client.exe)` |
| Login | 5 | `str 账号 + str 密码` |
| StartGame | 8 | `int32 角色索引` |
| Turn | 10 | `byte 方向` |
| Walk | 11 | `byte 方向` |
| Run | 12 | `byte 方向` |
| Chat | 13 | 见 ClientPackets.cs |

### 服务端 → 客户端

| 包 | ID | 说明 |
|---|---|---|
| Connected | 0 | 连上就发 |
| ClientVersion | 1 | `[1]` = 版本 OK |
| LoginSuccess | 9 | 角色列表 |
| StartGame | 14 | 进游戏成功 |
| MapInformation | 17 | `int32 index + str 文件名 + str 标题` |
| UserInformation | 21 | 详见下方 |
| UserLocation | 23 | `int32 X + int32 Y + byte 方向` |
| Chat | 30 | `str 内容` |
| NewItemInfo | 32 | 物品 |

UserInformation 字段顺序（`Shared/ServerPackets.cs:632`）：

```
uint32 ObjectID, uint32 RealId, str Name, str GuildName, str GuildRank,
int32 NameColour, u8 Class, u8 Gender, u16 Level, int32 X, int32 Y,
u8 Direction, u8 Hair, int32 HP, int32 MP, int64 Exp, int64 MaxExp, ...
```

方向枚举：`Up=0, UpRight=1, Right=2, DownRight=3, Down=4, DownLeft=5, Left=6, UpLeft=7`

## 坐标与碰撞（已改用怒战数据）

**位置和碰撞完全使用怒战的数据，与 Crystal 的比奇省地形无关。**

### 碰撞矩阵

```
data/matrix/{地图组}matrix.js   →  {"ver":1, "matrix":[[...],[...]]}
```

- 尺寸与地图格数一致（rr3 = **72 行 × 90 列**）
- 值：**`0` = 可走**，`1` = 云海/边界，`4` / `5` = 柱子等障碍
- 客户端 `Renderer.canWalk(x, y)` 直接查这个矩阵

### 坐标系统

- 玩家位置用**怒战格坐标** `state.nzX / state.nzY`（整数）
- 出生点：地图中心 `(45, 36)`（已确认 3×3 全可走）
- Crystal 的 `UserLocation` 回包只记录不应用（`state.player.srvX/srvY`）

### 移动流程：连续坐标

**位置是浮点连续坐标，不是格子跳转。**

```js
// state.fx / state.fy  浮点格坐标，每帧按速度推进
state.fx += (vx / len) * speed * dt;
state.fy += (vy / len) * speed * dt;

// 碰撞用最近的格子判定
const cellX = Math.round(state.fx);
const cellY = Math.round(state.fy);
if (!renderer.canWalk(cellX, cellY)) { 停下 }

// 渲染位置直接等于逻辑位置，没有插值
selfActor.x = selfActor.rx = state.fx;
selfActor.y = selfActor.ry = state.fy;
```

**为什么不用「格子跳转 + 渲染追赶」？**

那个模型天生有两个毛病，都消不掉：

1. **常态滞后**：逻辑每 N 毫秒瞬移一格，渲染去追，永远落后 0~1 格（平均半格）
2. **松手滑行**：松手时那半格的差距会滑出来，或者吸附时跳 14 像素

改成连续坐标后：

| 指标 | 格子跳转 | 连续坐标 |
|---|---|---|
| 渲染滞后 | 0.5 格 | **0.000 格** |
| 松手滑行 | 0.5 格 | **0.0000 格** |
| 走 CV | 0.26 | **0.19** |
| 跑 CV | 0.22 | **0.19** |

### 不要给服务端发 Walk（会被封 IP）

位置完全由本地碰撞决定，服务端那边的坐标没有意义。**更关键的是**：
每帧发 `Walk` 会瞬间超过服务端的 `MaxPacket = 50` 限制，触发

```
127.0.0.1 已断开连接，数据包数量过多。最后的数据包：Walk
→ Envir.UpdateIPBlock(IP, TimeSpan.FromHours(24))
```

**整个 IP 被封 24 小时，之后所有连接一连就断**。只有重启服务端（封禁在内存里）才能解开。

### 心跳保活

服务端 20 秒收不到数据就判超时下线，所以客户端 10 秒发一次 `KeepAlive`。

**KeepAlive 的 payload 是 `int64 Time`（8 字节时间戳）**：

```js
export function buildKeepAlive() {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(Date.now()), true);
  return new Writer()._raw(b).build(ClientPacketIds.KeepAlive);
}
```

只发 `<长度4><包ID2>` 而没有时间戳，服务端读 8 字节时会抛异常 →
`catch` 里同样是 `UpdateIPBlock(24小时)` → 封 IP。
（这是第二个踩过的坑，两个坑症状一样：连上就断。）

### 双摇杆：左走、右跑

底部并排两个摇杆，拖哪个就用哪个的速度（跑摇杆优先）：

| 摇杆 | 位置 | 步进 | 实测速度 | 动画 | 渲染插值 | 外观 |
|---|---|---|---|---|---|---|
| **走** | 左 | 280 ms/格 | 3.6 格/秒 | 11 fps | 3.75 格/秒 | 冷色 |
| **跑** | 右 | 95 ms/格 | 10.5 格/秒 | 20 fps | 11.1 格/秒 | 暖色 |

速度比 **2.93 倍**。

素材（`data/dev/res/private/main/Rocker/`）：

- 底盘 `1900012073.png`（150×150）
- 摇杆头 `1900012070.png`（68×68）
- 跑摇杆用 CSS `hue-rotate + saturate` 做成暖色，和走摇杆一眼区分

**关键：渲染插值速度必须等于实际移速**（只留 5% 余量）。
设得太快，角色会「冲到目标格然后停下来等下一格」，视觉上就是一顿一顿的——
速度波动系数 CV 会从 0.22 涨到 0.38 以上。

### 性能：两个关键优化

**1. 瓦片预缩放**（`TileCache`）

地图以 0.45 倍显示，如果每帧把 48 张 576×384 的原图缩放绘制，
每帧要做 48 次重采样，主线程扛不住。
所以在图片 onload 时就缩放到目标尺寸存进离屏 canvas，绘制时直接贴图：
帧耗时从几十毫秒降到 **0.4ms**。

**2. 移动逻辑挂到渲染帧上**（`renderer.onUpdate`）

原来用 `setInterval(50ms)` + 硬节流，实际步进间隔会在 100/150ms 之间跳，
走起来一顿一顿。改成在 `requestAnimationFrame` 里用 `dt` 累积：
走跑速度比从 1.67 变成精确的 **2.00**。

**3. 瓦片接缝**

相邻瓦片用同一条边界公式取右/下边界（`sx1 - sx0` 作为宽度），
避免各自 `Math.round` 之后在画面上留下贯穿全屏的 1px 细线。

## 界面（复刻怒战布局）

对着桌面上运行的怒战逐块复刻，素材全部来自 `data/dev/res/`：

| 位置 | 内容 | 用到的素材 |
|---|---|---|
| 左上 | 角色信息卡 | `private/main/1900012000.png`（金色龙纹头像框）+ CSS 血蓝条 |
| 右上 | 小地图 | 用碰撞矩阵实时生成缩略图（可走=土黄、建筑=暗红、障碍=深色） |
| 左下 | 双摇杆 | `private/main/Rocker/1900012073.png` + `1900012070.png` |
| 右下 | 技能轮盘 | `skill_icon_c/{12,26,27,3000,31,34,39,86}.png` |

**技能图标在 `skill_icon_c/`（中文版），不是 `skill_icon/`。**
`cfg_magicinfo.json` 里 181 条技能的 `icon` 字段就是文件名，例如：
`12` 刺杀剑术、`26` 烈火剑法、`27` 野蛮冲撞、`31` 魔法盾、`34` 逐日剑法、
`39` 开天斩、`86` 十步一杀、`3000` 大慈大悲手。

轮盘用 CSS 环形布局（`transform: rotate(--i*45deg) translateY(-86px) rotate(-i*45deg)`），
容器 268×268，半径 86 刚好不裁边。

**注意**：土黄色地图背景下，浅色文字必须加粗黑描边（`text-shadow` 四方向），
否则「战力」这类字会糊进背景里。

## 目录

```
h5client/
├── server/index.js        WebSocket ↔ TCP 桥 + 静态服务
├── public/
│   ├── index.html         登录 / 选角 / 游戏 三屏
│   ├── preview.html       纯地图预览（无需登录）
│   ├── style.css          怒战暗金配色
│   ├── js/
│   │   ├── protocol.js    协议编解码
│   │   ├── net.js         WebSocket 封装
│   │   ├── renderer.js    地图 + 精灵渲染
│   │   └── app.js         主流程
│   └── res/               从 CDN 拉取的资源
│       ├── data/map/rr3/  48 块地图瓦片
│       ├── data/mapbin/   地图尺寸
│       ├── data/matrix/   遮挡矩阵
│       ├── data/player/   角色特效层
│       ├── data/monster/  怪物 / 人形模型
│       └── data/dev/      UI 素材
└── tools（在 ../tools/）
    ├── nz-assets.py       从 LayaAir 缓存还原资源目录
    ├── nz-download.py     从 CDN 批量下载地图
    ├── stitch-map.py      瓦片拼接验证
    ├── cdp-shot.js        CDP 截图
    └── cdp-walk-test.js   走路测试
```
