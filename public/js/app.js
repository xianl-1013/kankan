/**
 * 主流程：连接 -> 版本校验 -> 登录 -> 选角 -> 进游戏
 */
import { GameSocket } from './net.js';
import {
  ClientPacketIds, buildClientVersion, buildLogin, buildStartGame, buildKeepAlive, Reader,
} from './protocol.js';
import { Renderer, Sprite } from './renderer.js';
import { Joystick } from './joystick.js';

const $ = (id) => document.getElementById(id);
const sock = new GameSocket();

/** 大数字缩写。BotbarUI 的 lb_hp 只有 8 个字符宽（"9999/9999"），
 *  服务端给的是 1000021 这种 7 位数字，直接拼会顶到隔壁蓝条上。 */
function fmtNum(n) {
  const v = Math.abs(n);
  if (v < 10000) return String(n);
  if (v < 1e8) return `${(n / 10000).toFixed(v < 1e5 ? 1 : 0)}万`;
  return `${(n / 1e8).toFixed(1)}亿`;
}

/**
 * 头像里的血球 / 蓝球（BotbarUI 的 img_hp / img_mp）
 *
 * img_hp(1900012032 红上半圆) 与 img_mp(1900012033 蓝上半圆) 并排组成一个球，
 * 中间由 img_hm(1900012507) 竖线分开 —— 这就是怒战的默认状态。
 * img_maxhp(1900012504 完整红球) 在原场景里 visible:false，只有特殊状态才顶上来。
 *
 * 两个半圆都绕左上角旋转 -90°，所以「宽」方向对应旋转后的「高」，
 * 直接改 img 的 width 百分比就是血量百分比。
 */
function setOrb(hpR, mpR) {
  const hpEl = $('orb-hp');
  const mpEl = $('orb-mp');
  if (!hpEl || !mpEl) return;
  const clamp = (r) => Math.max(0.02, Math.min(1, r));
  hpEl.querySelector('img').style.width = `${clamp(hpR) * 100}%`;
  mpEl.querySelector('img').style.width = `${clamp(mpR) * 100}%`;
}
window.__setOrb = setOrb;

const state = {
  versionOk: false,
  loginSent: false,
  characters: [],
  selected: null,
  inGame: false,
  nzX: 45,      // 怒战地图格坐标（整数，用于碰撞判定）
  nzY: 36,
  fx: 45,       // 浮点连续坐标（真正驱动移动和渲染）
  fy: 36,
};
window.__debug = { state, sock };

// ---------- UI 缩放 ----------
// 怒战 UI 按 1024x640 设计稿绝对定位（custom/xdw 皮肤，见 NZ-UI-FINDINGS.md），
// 这里只做一次整体等比缩放，不改任何控件坐标。
//
// 必须用 min：用 max 会按较大的一边放大，窗口比例和 16:9 一有偏差，
// 底部横栏（血条/等级/经验条）就会被裁到屏幕外面。
// min 保证整张设计稿都看得见，多出来的部分留边。
function syncUiScale() {
  const k = Math.min(window.innerWidth / 1024, window.innerHeight / 576);
  document.documentElement.style.setProperty('--ui-scale', k.toFixed(4));
}
window.addEventListener('resize', syncUiScale);
window.addEventListener('orientationchange', syncUiScale);
syncUiScale();

// 右上角时间槽（BotbarUI.lb_time）
setInterval(() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const el = $('clock-text');
  if (el) el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}, 1000);

// ---------- 界面切换 ----------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  $(`${name}-screen`).classList.add('active');
}

function setLoginStatus(text, isError = true) {
  const el = $('login-status');
  el.textContent = text;
  el.style.color = isError ? '#e57373' : '#9ccc65';
}

function logChat(text) {
  const log = $('chat-log');
  const line = document.createElement('div');
  line.className = 'line';
  line.textContent = text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

// ---------- 包处理 ----------
sock.onPacket(({ id, name, payload }) => {
  console.log(`[包] ${name} (${id}) len=${payload.length}`);
  const r = new Reader(payload);

  switch (id) {
    case 0: // Connected
      sock.send(buildClientVersion());
      break;

    case 1: // ClientVersion
      state.versionOk = payload.length > 0 && payload[0] === 1;
      setLoginStatus(state.versionOk ? '已连接服务器' : '客户端版本不匹配', !state.versionOk);
      break;

    case 9: { // LoginSuccess
      const count = r.i32();
      state.characters = [];
      for (let i = 0; i < count; i++) {
        const index = r.i32();
        const name = r.str();
        const level = r.u16();
        const cls = r.u8();
        const gender = r.u8();
        r.i64(); // LastAccess
        state.characters.push({ index, name, level, cls, gender });
      }
      renderCharacters();
      showScreen('select');
      break;
    }

    case 8: // LoginBanned
      setLoginStatus('账号被封禁或密码错误');
      break;

    case 14: // StartGame 成功
      console.log('[收] StartGame 成功，切换到游戏画面');
      state.inGame = true;
      showScreen('game');
      startRender();
      break;

    case 15: // StartGameBanned
      logChat('无法进入游戏（可能已被封禁）');
      break;

    case 16: // StartGameDelay
      logChat(`进入游戏延迟 ${r.i32()} 毫秒`);
      break;

    case 17: { // MapInformation
      const mapIndex = r.i32();
      const fileName = r.str();
      const title = r.str();
      logChat(`进入地图：${title}（${fileName}, #${mapIndex}）`);
      break;
    }

    case 21: { // UserInformation
      // uint32 ObjectID, uint32 RealId, str Name, str GuildName, str GuildRank,
      // int32 NameColour, u8 Class, u8 Gender, u16 Level, int32 X, int32 Y,
      // u8 Direction, u8 Hair, int32 HP, int32 MP, ...
      r.u32();            // ObjectID
      r.u32();            // RealId
      const name = r.str();
      r.str();            // GuildName
      r.str();            // GuildRank
      r.i32();            // NameColour
      const cls = r.u8();
      const gender = r.u8();
      const level = r.u16();
      const mx = r.i32();
      const my = r.i32();
      const dir = r.u8();
      r.u8();             // Hair
      const hp = r.i32();
      const mp = r.i32();

      state.player = { name, cls, gender, level, mx, my, dir, hp, mp };
      logChat(`角色：${name} Lv${level} HP ${hp} MP ${mp}（服务端坐标 ${mx},${my}，已改用怒战地图）`);

      // 角色信息卡
      $('hero-level').textContent = String(level);
      $('hp-text').textContent = `${fmtNum(hp)} / ${fmtNum(hp)} / ${fmtNum(hp)}`;
      $('mp-text').textContent = '';
      // Crystal 的 UserInformation 不带 MaxHP，这里先按满血显示。
      // 怒战 UI 里没有「战力」控件，不再自己造一个。
      $('hp-fill').style.width = '100%';
      $('mp-fill').style.width = '100%';
      // 满血：显示完整红球，隐藏两个液面
      break;
    }

    case 23: { // UserLocation: int32 X, int32 Y, byte Direction
      const x = r.i32();
      const y = r.i32();
      const d = r.u8();
      // 怒战地图模式：位置完全由本地碰撞矩阵决定，
      // 服务端用的是比奇省地形，两套坐标不互通，这里只记录不应用。
      if (state.player) {
        state.player.srvX = x;
        state.player.srvY = y;
        state.player.srvDir = d;
      }
      break;
    }

    case 30: { // Chat
      const msg = r.str();
      logChat(msg);
      break;
    }

    default:
      if (!state.inGame && id !== 32) {
        console.log(`[包] ${name} (${id}) ${payload.length}B`);
      }
  }
});

// ---------- 选角 ----------
function renderCharacters() {
  const list = $('char-list');
  list.innerHTML = '';
  const CLASS_NAMES = ['战士', '法师', '道士', '刺客', '弓箭手'];

  state.characters.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `
      <div class="cname">${c.name}</div>
      <div class="cinfo">等级 ${c.level} · ${CLASS_NAMES[c.cls] || '未知'} · ${c.gender ? '女' : '男'}</div>`;
    card.onclick = () => {
      state.selected = c;
      document.querySelectorAll('.char-card').forEach((el) => el.classList.remove('selected'));
      card.classList.add('selected');
      $('btn-start').disabled = false;
    };
    list.appendChild(card);
  });
}

$('btn-start').onclick = () => {
  console.log('[点击] 开始游戏 selected=', JSON.stringify(state.selected));
  if (!state.selected) { logChat('请先选择一个角色'); return; }
  const bytes = buildStartGame(state.selected.index);
  console.log('[发] StartGame bytes=', Array.from(bytes));
  sock.send(bytes);
  $('btn-start').disabled = true;
};

// ---------- 登录 ----------
$('btn-login').onclick = () => {
  if (!state.versionOk) { setLoginStatus('尚未连接服务器'); return; }
  const account = $('account').value.trim();
  const password = $('password').value;
  if (!account || !password) { setLoginStatus('请输入账号和密码'); return; }
  sock.send(buildLogin(account, password));
  setLoginStatus('登录中…', false);
};

$('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-login').click();
});

// ---------- 心跳 ----------
// Crystal 服务端会踢掉长时间无数据的连接
const KEEP_ALIVE = new Uint8Array([4, 0, 2, 0]); // 长度4, 包ID=2
let keepAliveTimer = null;

function startKeepAlive() {
  if (keepAliveTimer) return;
  // TODO: 包的内部结构待确认，暂时停用
  // keepAliveTimer = setInterval(() => sock.send(KEEP_ALIVE), 5000);
}

// ---------- 渲染层 ----------
const renderer = new Renderer($('game-canvas'));
window.__renderer = renderer;

let selfActor = null;
const keys = new Set();
let lastMove = performance.now();

// 双摇杆：左边走、右边跑。拖哪个就用哪个的速度
let walkDir = -1;
let runDir = -1;
const jsWalk = new Joystick($('joystick-walk'), {
  onChange: (d) => { walkDir = d; },
});
const jsRun = new Joystick($('joystick-run'), {
  onChange: (d) => { runDir = d; },
});
window.__jsWalk = jsWalk;
window.__jsRun = jsRun;

// 位置完全使用怒战格坐标（state.nzX / state.nzY），
// 与 Crystal 的比奇省坐标脱离，不再做映射。

async function startRender() {
  try {
    renderer._resize();   // 此时 canvas 已从 display:none 切出来，需要重算尺寸
    // 新手村：3x 地图组（土路、木屋、石板广场），怒战开局的初始场景
    const def = await renderer.loadMap('3x');
    logChat(`地图已加载：${def.group} ${def.cellsW}×${def.cellsH} 格（${def.cols}×${def.rows} 块瓦片）`);
    logChat(renderer.collision
      ? `碰撞数据已加载：${renderer.collision[0].length}×${renderer.collision.length}`
      : '⚠ 未找到碰撞数据，所有格子都可走');

    // 小地图标题（3x = 盟重省）
    const MAP_NAMES = { '3x': '盟重省', rr3: '仙宫', rr2: '未知' };
    $('minimap-title').textContent = MAP_NAMES[def.group] || def.group;
    buildMinimap();

    // 出生点：盟重省中央的石板广场（约 330,330）
    const start = renderer.nearestWalkable(330, 330);
    state.nzX = start.x;
    state.nzY = start.y;
    state.fx = start.x;
    state.fy = start.y;

    const self = {
      x: start.x,
      y: start.y,
      sprite: new Sprite('res/data/monster/monster_20133_0', {
        targetHeight: 230,
        // 帧率取自 cfg_model_info.json 的 *_interval（秒/帧）
        fpsByAction: { 0: 4, 1: 11, 2: 12 },
      }),
    };
    self.sprite.preload([0, 1]);   // 预载站立/行走的 8 个方向，切方向不闪
    selfActor = renderer.addActor(self);
    renderer.setSelf(self);
    renderer.start();
    logChat(`出生点 (${start.x}, ${start.y})，用摇杆或 WASD 移动`);
  } catch (e) {
    console.error(e);
    logChat(`地图加载失败：${e.message}`);
  }
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    e.preventDefault();
    keys.add(k);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

// MirDirection: Up=0, UpRight=1, Right=2, DownRight=3,
//               Down=4, DownLeft=5, Left=6, UpLeft=7
const DIR_VEC = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

function dirFromKeys() {
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  if (up && right) return 1;
  if (down && right) return 3;
  if (down && left) return 5;
  if (up && left) return 7;
  if (up) return 0;
  if (right) return 2;
  if (down) return 4;
  if (left) return 6;
  return -1;
}

// 移动速度（格/秒）：走跑差距拉开，体感明显
const WALK_SPEED = 3.6;      // 走 ≈ 4.6 秒跑完 100 格
const RUN_SPEED = 10.5;      // 跑 ≈ 2.9 倍速
let blockedUntil = 0;      // 撞墙后的一小段时间内不播行走动画

let lastWalkActive = null;
let lastRunActive = null;


/**
 * 每帧驱动的移动逻辑：挂在渲染循环上（renderer.onUpdate），
 * 用累积时间决定什么时候跨下一格。比 setInterval(50) 硬节流均匀得多，
 * 不会出现 100ms/150ms 交替的顿挫感。
 */
function tickMove(dt) {
  if (!state.inGame || !selfActor) return;

  updateMinimapDot();

  // 正在拖动的摇杆高亮
  const walkActive = walkDir >= 0;
  const runActive = runDir >= 0;
  if (walkActive !== lastWalkActive) {
    lastWalkActive = walkActive;
    $('joystick-walk').classList.toggle('active', walkActive);
  }
  if (runActive !== lastRunActive) {
    lastRunActive = runActive;
    $('joystick-run').classList.toggle('active', runActive);
  }

  const kd = dirFromKeys();
  // 优先级：跑摇杆 > 走摇杆 > 键盘
  const dir = runDir >= 0 ? runDir : (walkDir >= 0 ? walkDir : kd);
  const running = runDir >= 0;

  if (dir < 0) {

    if (selfActor.sprite) selfActor.sprite.setAction(0);
    return;
  }

  // 转向立刻生效
  if (selfActor.sprite) selfActor.sprite.setDir(dir);

  // 撞墙冷却
  if (performance.now() < blockedUntil) {
    if (selfActor.sprite) selfActor.sprite.setAction(0);
    return;
  }

  // ── 连续坐标移动 ───────────────────────────────────────────────
  // 不再「瞬移一格 + 渲染追赶」。逻辑位置本身就是浮点，每帧按速度推进，
  // 渲染位置和逻辑位置完全重合 —— 从根本上消除滞后和松手滑行。
  const speed = running ? RUN_SPEED : WALK_SPEED;       // 格/秒
  const [vx, vy] = DIR_VEC[dir];
  const vlen = Math.hypot(vx, vy) || 1;
  const nx = state.fx + (vx / vlen) * speed * dt;
  const ny = state.fy + (vy / vlen) * speed * dt;

  // 碰撞按最近的格子判定
  const cellX = Math.round(nx);
  const cellY = Math.round(ny);
  if (!renderer.canWalk(cellX, cellY)) {
    blockedUntil = performance.now() + 200;   // 撞到云海/柱子，站住一会儿
    if (selfActor.sprite) selfActor.sprite.setAction(0);
    return;
  }

  state.fx = nx;
  state.fy = ny;
  state.nzX = cellX;
  state.nzY = cellY;

  // 渲染位置与逻辑完全同步，不做插值
  selfActor.x = nx;
  selfActor.y = ny;
  selfActor.rx = nx;
  selfActor.ry = ny;

  if (selfActor.sprite) {
    selfActor.sprite.setAction(1);
    selfActor.sprite.fpsByAction[1] = running ? 20 : 11;   // 跑步动作更快
  }

  // 这里不再给服务端发 Walk。
  // 位置完全由本地碰撞决定，服务端那边的坐标没有意义；
  // 而且每帧发 Walk 会瞬间超过服务端 MaxPacket=50 的限制，
  // 触发「数据包数量过多」→ UpdateIPBlock 封禁 IP 24 小时（踩过两次）。
  // 连接保活交给下面的心跳定时器。
}

// 移动逻辑挂到渲染帧上
renderer.onUpdate = tickMove;

// ---------- 小地图 ----------
let minimapBuilt = false;

/** 小地图底图：优先用怒战预生成的实景缩略图（uiminimap/），没有 canvas 就直接标记完成 */
function buildMinimap() {
  const m = renderer.collision;
  const cv = $('minimap-canvas');
  if (!cv) {
    // 已换成 <img id="minimap-img"> 真素材，不需要再画碰撞图
    minimapBuilt = true;
    return;
  }
  if (!m || !m.length) return;

  const W = cv.width;
  const H = cv.height;
  const rows = m.length;
  const cols = m[0].length;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;

  for (let y = 0; y < H; y++) {
    const my = Math.min(rows - 1, Math.floor((y / H) * rows));
    const row = m[my];
    for (let x = 0; x < W; x++) {
      const mx = Math.min(cols - 1, Math.floor((x / W) * cols));
      const v = row ? row[mx] : 1;
      const i = (y * W + x) * 4;
      if (v === 0) {
        // 可走：土黄色
        d[i] = 196; d[i + 1] = 172; d[i + 2] = 118; d[i + 3] = 255;
      } else if (v === 4 || v === 5) {
        // 建筑/柱子：暗红
        d[i] = 120; d[i + 1] = 70; d[i + 2] = 60; d[i + 3] = 255;
      } else {
        // 障碍/边界：深色
        d[i] = 26; d[i + 1] = 28; d[i + 2] = 40; d[i + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  minimapBuilt = true;
}

let lastMapX = -1;
let lastMapY = -1;

/** 更新小地图上的角色点（坐标没变就跳过，省 DOM 开销） */
function updateMinimapDot() {
  if (!minimapBuilt || !renderer.mapDef) return;
  const rx = Math.round(state.fx);
  const ry = Math.round(state.fy);
  if (rx === lastMapX && ry === lastMapY) return;
  lastMapX = rx;
  lastMapY = ry;

  const def = renderer.mapDef;
  const px = Math.max(0, Math.min(1, state.fx / def.cellsW));
  const py = Math.max(0, Math.min(1, state.fy / def.cellsH));
  // 小地图点是一个铺满 143x131 的层，点位通过 CSS 变量交给 ::after 定位
  const dot = $('minimap-dot');
  dot.style.setProperty('--dx', `${px * 100}%`);
  dot.style.setProperty('--dy', `${py * 100}%`);
  $('minimap-coord').textContent = `${rx},${ry}`;
}

// 心跳：服务端 20 秒收不到数据就判超时下线，10 秒发一次
setInterval(() => {
  if (sock.connected && state.inGame) sock.send(buildKeepAlive());
}, 10000);

// ---------- 调试：URL 参数自动登录 ----------
// 用法: /?acc=账号&pwd=密码  或  &auto=1 自动选第一个角色进游戏
const qp = new URLSearchParams(location.search);
if (qp.get('acc') && qp.get('pwd')) {
  $('account').value = qp.get('acc');
  $('password').value = qp.get('pwd');
  console.log('[调试] 已填入账号，等待版本校验');

  const waitVersion = setInterval(() => {
    if (state.versionOk) {
      clearInterval(waitVersion);
      $('btn-login').click();
      console.log('[调试] 已自动提交登录');
    }
  }, 200);

  if (qp.get('auto') === '1') {
    const waitChars = setInterval(() => {
      if (state.inGame) { clearInterval(waitChars); return; }
      const card = document.querySelector('.char-card');
      if (card) {
        card.click();
        $('btn-start').click();
        clearInterval(waitChars);
        console.log('[调试] 已自动选角并开始游戏');
      }
    }, 300);
  }
}

// ---------- 启动 ----------
sock.connect()
  .then(() => {
    console.log('桥接服务已连接');
    startKeepAlive();
  })
  .catch(() => setLoginStatus('无法连接服务器，请确认 Server.exe 和桥接服务都在运行'));
