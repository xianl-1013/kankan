/**
 * 怒战地图渲染层（Canvas 2D）
 *
 * 逆向自 GMScript/bundle.js：
 *   MAP = { WIDTH:48, HEIGHT:32, HALF_WIDTH:24, HALF_HEIGHT:16, GRID:12 }
 *   格子 48x32 像素，每瓦片 12x12 格 = 576x384 像素
 *   瓦片路径 data/map/{组}/{行:3位}{列:4位}.jpg
 *   瓦片像素位置 (列*576, 行*384)
 */

export const MAP = { GRID: 12, WIDTH: 48, HEIGHT: 32, HALF_WIDTH: 24, HALF_HEIGHT: 16 };
export const TILE_W = MAP.GRID * MAP.WIDTH;    // 576
export const TILE_H = MAP.GRID * MAP.HEIGHT;   // 384
export const CELL_W = MAP.WIDTH;               // 48 每格像素宽
export const CELL_H = MAP.HEIGHT;              // 32 每格像素高

const pad = (n, w) => String(n).padStart(w, '0');

/** 地图组描述（来自 data/mapbin/{组}.json） */
export class MapDef {
  constructor(group, w, h) {
    this.group = group;
    this.cellsW = w;
    this.cellsH = h;
    this.cols = Math.ceil(w / MAP.GRID);
    this.rows = Math.ceil(h / MAP.GRID);
    this.pixelW = w * CELL_W;
    this.pixelH = h * CELL_H;
  }

  static async load(group, base = 'res') {
    const r = await fetch(`${base}/data/mapbin/${group}.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`mapbin ${group} 加载失败`);
    const j = await r.json();
    return new MapDef(group, j.w, j.h);
  }

  tileUrl(row, col, base = 'res') {
    return `${base}/data/map/${this.group}/${pad(row, 3)}${pad(col, 4)}.jpg`;
  }
}

/**
 * 瓦片缓存（按需加载 + LRU 淘汰）
 *
 * 两个关键点：
 *
 * 1. **预缩放**：地图以 0.45 倍显示，每帧缩放 576x384 的原图开销太大，
 *    加载时就缩放到目标尺寸存进离屏 canvas，绘制时直接贴图。
 *
 * 2. **不能全量加载**：怒战的小地图（rr3）只有 48 块瓦片，可以一次拉完；
 *    但新手村 3x 是 1000x800 格 = 84x67 = **5628 块**，
 *    全量预缩放要占 1GB 内存。所以只保留视口附近的，远处用 LRU 淘汰。
 */
class TileCache {
  constructor(mapDef, base = 'res', zoom = 1, maxTiles = 400) {
    this.map = mapDef;
    this.base = base;
    this.zoom = zoom;
    this.maxTiles = maxTiles;
    this.cache = new Map();   // "r_c" -> {img, scaled, ready, lastUsed}
    this.cdn = 'https://h5cdn-hs.dhsf.xqhuyu.com/219298/';
  }

  get(row, col) {
    const key = `${row}_${col}`;
    let e = this.cache.get(key);
    if (e) {
      e.lastUsed = performance.now();
      return e;
    }
    if (row < 0 || col < 0 || row >= this.map.rows || col >= this.map.cols) return null;

    const img = new Image();
    e = { img, scaled: null, ready: false, lastUsed: performance.now() };
    this.cache.set(key, e);
    this.evictIfNeeded();

    img.onload = () => {
      try {
        const w = Math.max(1, Math.round(TILE_W * this.zoom));
        const h = Math.max(1, Math.round(TILE_H * this.zoom));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, w, h);
        e.scaled = c;
        e.ready = true;
      } catch (err) {
        e.ready = true;   // 缩放失败就直接用原图
      }
    };
    img.onerror = () => {
      // 本地没下载到的瓦片，直接从 CDN 拉
      if (!img.__triedCdn) {
        img.__triedCdn = true;
        img.src = `${this.cdn}data/map/${this.map.group}/${String(row).padStart(3, '0')}${String(col).padStart(4, '0')}.jpg`;
      } else {
        e.failed = true;
      }
    };
    img.src = this.map.tileUrl(row, col, this.base);
    return e;
  }

  /** 超过上限时淘汰最久没被用过的瓦片 */
  evictIfNeeded() {
    if (this.cache.size <= this.maxTiles) return;
    const entries = [...this.cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const drop = Math.max(1, Math.floor(this.maxTiles * 0.2));
    for (let i = 0; i < drop && i < entries.length; i++) {
      const [k, v] = entries[i];
      v.img.onload = null;
      v.img.onerror = null;
      v.scaled = null;
      this.cache.delete(k);
    }
  }

  /** 预热视口周围 */
  preload(camX, camY, vw, vh) {
    const c0 = Math.max(0, Math.floor((camX - vw / 2) / TILE_W) - 1);
    const c1 = Math.min(this.map.cols - 1, Math.floor((camX + vw / 2) / TILE_W) + 1);
    const r0 = Math.max(0, Math.floor((camY - vh / 2) / TILE_H) - 1);
    const r1 = Math.min(this.map.rows - 1, Math.floor((camY + vh / 2) / TILE_H) + 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.get(r, c);
  }
}

/**
 * 精灵动画
 *
 * 怒战的精灵文件命名是 {动作}_{方向}.png：
 *   - 第一个数字 = 动作（0 站立 / 1 行走 / 2 攻击 / 3 / 5 / 11）
 *   - 第二个数字 = 方向 0..7（Up=0 顺时针到 UpLeft=7）
 *   - 每张 PNG 内部是 2x2 图集 = 4 帧动画
 *
 * 注意：不能把方向当帧循环播放，否则角色会原地转圈。
 */
export class Sprite {
  /**
   * @param {string} basePath
   * @param {{fps?:number, targetHeight?:number, fpsByAction?:Object<number,number>}} opts
   *   fpsByAction 来自 cfg_model_info.json 的 *_interval（秒/帧）：
   *     idle 0.25 → 4fps, walk 0.09 → 11fps, attack 0.085 → 12fps
   */
  constructor(basePath, { fps = 8, targetHeight = 110, fpsByAction = null } = {}) {
    this.basePath = basePath.replace(/\/$/, '');
    this.fps = fps;
    this.fpsByAction = fpsByAction || {};
    this.targetHeight = targetHeight;   // 屏幕上的目标高度（像素）
    this.action = 0;
    this.dir = 0;
    this.frame = 0;
    this.t = 0;
    this.cache = new Map();       // key -> Image
    this.frameData = new Map();   // key -> [{sx,sy,sw,sh,ox,oy}, ...]
    this._refH = new Map();
  }

  setAction(a) {
    if (a !== this.action) { this.action = a; this.frame = 0; this.t = 0; }
  }

  setDir(d) {
    const nd = ((d % 8) + 8) % 8;
    if (nd !== this.dir) { this.dir = nd; this.frame = 0; this.t = 0; }
  }

  /** 当前动作该用多少帧率 */
  currentFps() {
    return this.fpsByAction[this.action] || this.fps;
  }

  update(dt) {
    this.t += dt;
    const step = 1 / this.currentFps();

    // 帧数优先用官方 json
    const key = `${this.action}_${this.dir}`;
    this._load(key);
    let total = 0;
    const list = this.frameData.get(key);
    if (list) {
      total = list.length;
    } else {
      const img = this.image();
      total = img ? this.analyze(img).cells.length : 4;
    }

    while (this.t >= step) {
      this.t -= step;
      this.frame = (this.frame + 1) % Math.max(1, total);
    }
  }

  /**
   * 加载某个 动作_方向 的图片 + 它的图集描述 json。
   *
   * 怒战的精灵是标准 LayaAir 图集：xxx.png 配 xxx.json，
   * json 的 frames 字段给出每一帧的精确矩形和锚点偏移（ox/oy）。
   * 用官方数据绘制，帧数和位置都精确，不会出现「一格两个分身」。
   */
  _load(key) {
    if (this.cache.has(key)) return;

    const img = new Image();
    img.onerror = () => { img.__failed = true; };
    img.src = `${this.basePath}/${key}.png`;
    this.cache.set(key, img);

    fetch(`${this.basePath}/${key}.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.frames) return;
        const list = Object.keys(j.frames)
          .sort()
          .map((k) => {
            const f = j.frames[k];
            const ss = f.spriteSourceSize || {};
            return {
              sx: f.frame.x,
              sy: f.frame.y,
              sw: f.frame.w,
              sh: f.frame.h,
              ox: ss.ox || 0,
              oy: ss.oy || 0,
            };
          });
        if (list.length) this.frameData.set(key, list);
      })
      .catch(() => { /* 没有 json 就走图像分析兜底 */ });
  }

  image() {
    const key = `${this.action}_${this.dir}`;
    this._load(key);
    const img = this.cache.get(key);
    if (img && img.complete && img.naturalWidth) return img;
    return null;
  }

  /** 官方帧数据（没有 json 时返回 null） */
  framesOf(key) {
    return this.frameData.get(key) || null;
  }

  /** 该图集的参考高度（各帧高度的中位数），用于统一缩放 */
  refHeight(key, list) {
    let h = this._refH.get(key);
    if (h) return h;
    const hs = list.map((f) => f.sh).sort((a, b) => a - b);
    h = hs[Math.floor(hs.length / 2)] || 280;
    this._refH.set(key, h);
    return h;
  }

  /** 预加载全部 8 个方向 + 常用动作（图片和 json 一起），避免切方向时闪 */
  preload(actions = [0, 1]) {
    for (const act of actions) {
      for (let d = 0; d < 8; d++) this._load(`${act}_${d}`);
    }
  }

  /**
   * 分析精灵图集：自动检测网格布局 + 每格的实际内容矩形。
   *
   * 怒战的图集布局并不统一：
   *   0_3.png  473x624  → 2 列 x 2 行
   *   1_3.png  620x787  → 2 列 x 3 行
   * 如果写死 2x2，1_3 这种就会取到一格半的内容，
   * 画面上就出现「同一个格子里有两个分身」。
   *
   * 做法：扫描 alpha，全透明的行/列就是帧分隔线，据此切出真实行列；
   * 再对每格求不透明区域的最小包围盒，用包围盒的底边中心当脚底锚点。
   *
   * @returns {{cells: Array<{sx:number,sy:number,sw:number,sh:number,ox:number,oy:number}>}}
   */
  analyze(img) {
    if (img.__cells) return img.__cells;

    const fallback = () => {
      const qw = Math.floor(img.naturalWidth / 2);
      const qh = Math.floor(img.naturalHeight / 2);
      const cells = [];
      for (let i = 0; i < 4; i++) {
        cells.push({
          sx: (i % 2) * qw,
          sy: Math.floor(i / 2) * qh,
          sw: qw,
          sh: qh,
          ox: qw / 2,
          oy: qh,
        });
      }
      img.__cells = { cells };
      return img.__cells;
    };

    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const W = c.width;
      const H = c.height;
      const data = g.getImageData(0, 0, W, H).data;
      const ALPHA = 16;

      const rowSum = new Int32Array(H);
      const colSum = new Int32Array(W);
      for (let y = 0; y < H; y++) {
        const base = y * W * 4;
        for (let x = 0; x < W; x++) {
          if (data[base + x * 4 + 3] > ALPHA) { rowSum[y]++; colSum[x]++; }
        }
      }

      const segments = (sum) => {
        const segs = [];
        let start = -1;
        for (let i = 0; i < sum.length; i++) {
          if (sum[i] > 0) {
            if (start < 0) start = i;
          } else if (start >= 0) {
            segs.push([start, i - 1]);
            start = -1;
          }
        }
        if (start >= 0) segs.push([start, sum.length - 1]);
        return segs;
      };

      const rowSegs = segments(rowSum);
      let colSegs = segments(colSum);

      // 行分割很可靠（帧之间有明显的透明带）。
      // 列不行：左右两列的角色经常有披风/剑光越过中线，找不到全透明的列，
      // 所以列数按游戏布局固定为 2，检测不出来就均分。
      if (colSegs.length < 2) {
        const half = Math.floor(W / 2);
        colSegs = [[0, half - 1], [half, W - 1]];
      }

      if (!rowSegs.length || rowSegs.length > 6 || colSegs.length > 6) {
        return fallback();
      }

      const cells = [];
      for (const [y0, y1] of rowSegs) {
        for (const [x0, x1] of colSegs) {
          let minX = x1;
          let maxX = x0;
          let minY = y1;
          let maxY = y0;
          let found = false;
          for (let y = y0; y <= y1; y++) {
            const base = y * W * 4;
            for (let x = x0; x <= x1; x++) {
              if (data[base + x * 4 + 3] > ALPHA) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
              }
            }
          }
          if (!found) continue;
          const sw = maxX - minX + 1;
          const sh = maxY - minY + 1;
          cells.push({ sx: minX, sy: minY, sw, sh, ox: sw / 2, oy: sh });
        }
      }

      if (!cells.length) return fallback();
      img.__cells = { cells };
      console.log(`[图集] ${img.src.split('/').pop()}  ${colSegs.length}列×${rowSegs.length}行 = ${cells.length}帧`);
    } catch (e) {
      console.warn('[图集] 分析失败，退回 2x2', e);
      return fallback();
    }
    return img.__cells;
  }

  /** 取某一帧的源矩形 */
  cell(img, frame) {
    const a = this.analyze(img);
    return a.cells[frame % a.cells.length];
  }
}

/**
 * 主渲染器
 *
 * 缩放的来源：怒战 PC 端视口是 6x6 个地图瓦片
 *   （GMScript/bundle.js: minx=-2, maxx=4, miny=-2, maxy=4）
 * 每瓦片 576x384，6 瓦片 = 3456x2304 像素。
 * 在 1600x900 的窗口里，缩放约 0.45 才能看到同样的范围。
 */
export const DEFAULT_ZOOM = 0.45;

export class Renderer {
  constructor(canvas, { zoom = DEFAULT_ZOOM } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = zoom;
    this.mapDef = null;
    this.tiles = null;
    this.actors = [];       // {x, y, rx, ry, sprite, name}
    this.camera = { x: 0, y: 0 };
    this.self = null;
    this.running = false;
    this.lastT = 0;
    this.fpsCounter = { frames: 0, t: 0, value: 0 };
    this.costSamples = [];   // 每帧 update+draw 的耗时，用于定位卡顿
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.vw = w;
    this.vh = h;
  }

  async loadMap(group) {
    this.mapDef = await MapDef.load(group);
    this.tiles = new TileCache(this.mapDef, 'res', this.zoom);

    // 怒战的碰撞矩阵：data/matrix/{组}matrix.js
    // 尺寸与地图格数一致（rr3 = 90x72），值 0 = 可走，1/4/5 = 障碍
    this.collision = null;
    try {
      const r = await fetch(`res/data/matrix/${group}matrix.js`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j.matrix)) {
          this.collision = j.matrix;
          console.log(`[碰撞] ${group} 矩阵 ${this.collision[0].length}x${this.collision.length}`);
        }
      }
    } catch (e) {
      console.warn('[碰撞] 矩阵加载失败，将不做地形限制', e);
    }


    // 不做全量预加载：小地图（rr3 48 块）没问题，
    // 但新手村 3x 有 5628 块，全量预缩放要吃掉 1GB 内存。
    // 绘制时按需加载 + LRU 淘汰就够了。
    return this.mapDef;
  }

  /**
   * 该格能不能走（用怒战自己的碰撞数据）
   * @param {number} x 格坐标（整数）
   * @param {number} y 格坐标（整数）
   */
  canWalk(x, y) {
    if (!this.collision) return true;          // 没有碰撞数据就不限制
    const gx = Math.round(x);
    const gy = Math.round(y);
    if (gy < 0 || gy >= this.collision.length) return false;
    const row = this.collision[gy];
    if (gx < 0 || gx >= row.length) return false;
    return row[gx] === 0;                      // 0 = 可走
  }

  /** 找离 (x,y) 最近的可走格子 */
  nearestWalkable(x, y, maxRadius = 12) {
    if (this.canWalk(x, y)) return { x, y };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;   // 只查这一圈
          if (this.canWalk(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return { x, y };
  }

  addActor(actor) {
    if (actor.rx === undefined) actor.rx = actor.x;
    if (actor.ry === undefined) actor.ry = actor.y;
    this.actors.push(actor);
    return actor;
  }

  setSelf(actor) {
    this.self = actor;
    this.self.rx = actor.x;
    this.self.ry = actor.y;
    this.camera.x = actor.x * CELL_W;
    this.camera.y = actor.y * CELL_H;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      const dt = Math.min((t - this.lastT) / 1000, 0.1);
      this.lastT = t;
      const costStart = performance.now();
      // 单帧异常不能让整个渲染循环停掉，否则画面会卡死在这一帧
      try {
        this.update(dt);
        this.draw();
      } catch (e) {
        console.error('[渲染异常]', e && e.message ? e.message : e);
      }
      // 记录每帧 CPU 耗时，用于判断卡顿是渲染还是别的原因
      const cost = performance.now() - costStart;
      this.costSamples.push(cost);
      if (this.costSamples.length > 120) this.costSamples.shift();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  update(dt) {
    // 所有角色：渲染位置平滑追向逻辑位置
    // 逻辑位置由服务端确认，可能来回跳（撞墙被退回），
    // 但渲染位置是连续移动的，所以看不到瞬移/分身。
    for (const a of this.actors) {
      // 坐标非法时跳过，避免 NaN 污染渲染坐标
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
      if (!Number.isFinite(a.rx) || !Number.isFinite(a.ry)) { a.rx = a.x; a.ry = a.y; }
      const speed = a.moveSpeed || 5.5;      // 格/秒，略快于服务端 380ms 一格
      const maxStep = speed * dt;
      const dx = a.x - a.rx;
      const dy = a.y - a.ry;
      const dist = Math.hypot(dx, dy);
      if (dist <= maxStep) {
        a.rx = a.x;
        a.ry = a.y;
      } else {
        a.rx += (dx / dist) * maxStep;
        a.ry += (dy / dist) * maxStep;
      }
      if (a.sprite) a.sprite.update(dt);
    }

    // 相机跟随渲染位置，不用逻辑位置（避免撞墙回退时镜头抖动）
    if (this.self && Number.isFinite(this.self.rx) && Number.isFinite(this.self.ry)) {
      const k = Math.min(1, dt * 10);
      this.camera.x += (this.self.rx * CELL_W - this.camera.x) * k;
      this.camera.y += (this.self.ry * CELL_H - this.camera.y) * k;

      // 相机算坏了就立刻拉回角色身上，否则整张地图会画到屏幕外（黑屏）
      if (!Number.isFinite(this.camera.x) || !Number.isFinite(this.camera.y)) {
        console.warn('[相机] 坐标异常，重置到角色位置');
        this.camera.x = this.self.rx * CELL_W;
        this.camera.y = this.self.ry * CELL_H;
      }

      // 钳制在地图范围内，别露出地图外的黑边；地图比视口小时居中
      const def = this.mapDef;
      const vw = this.vw;
      const vh = this.vh;
      const z = this.zoom;
      if (def && Number.isFinite(def.cellsW) && Number.isFinite(def.cellsH) && vw > 0 && vh > 0 && z > 0) {
        const halfW = vw / z / 2;
        const halfH = vh / z / 2;
        const mapW = def.cellsW * CELL_W;
        const mapH = def.cellsH * CELL_H;
        this.camera.x = mapW > halfW * 2
          ? Math.max(halfW, Math.min(mapW - halfW, this.camera.x))
          : mapW / 2;
        this.camera.y = mapH > halfH * 2
          ? Math.max(halfH, Math.min(mapH - halfH, this.camera.y))
          : mapH / 2;
      }
    }

    const f = this.fpsCounter;
    f.frames++; f.t += dt;
    if (f.t >= 0.5) { f.value = Math.round(f.frames / f.t); f.frames = 0; f.t = 0; }

    // 把游戏逻辑（移动）也挂在渲染帧上，避免 setInterval 的定时抖动造成走路一顿一顿
    if (this.onUpdate) this.onUpdate(dt);
  }

  draw() {
    const { ctx, vw, vh, zoom } = this;
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, vw, vh);
    if (!this.mapDef) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 视口在世界坐标下的宽高（缩放后能看到更大的地图范围）
    const viewW = vw / zoom;
    const viewH = vh / zoom;
    const camL = this.camera.x - viewW / 2;
    const camT = this.camera.y - viewH / 2;

    // 只画视口内的瓦片
    const c0 = Math.max(0, Math.floor(camL / TILE_W));
    const c1 = Math.min(this.mapDef.cols - 1, Math.floor((camL + viewW) / TILE_W));
    const r0 = Math.max(0, Math.floor(camT / TILE_H));
    const r1 = Math.min(this.mapDef.rows - 1, Math.floor((camT + viewH) / TILE_H));

    const tw = TILE_W * zoom;
    const th = TILE_H * zoom;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const e = this.tiles.get(r, c);
        // 相邻瓦片用同一条边界公式，右/下边界取下一格的位置，
        // 避免各自 round 之后留下 1px 缝（画面上会看到贯穿全屏的细线）
        const sx0 = Math.round((c * TILE_W - camL) * zoom);
        const sy0 = Math.round((r * TILE_H - camT) * zoom);
        const sx1 = Math.round(((c + 1) * TILE_W - camL) * zoom);
        const sy1 = Math.round(((r + 1) * TILE_H - camT) * zoom);
        const dw = sx1 - sx0;
        const dh = sy1 - sy0;

        if (e && e.scaled) {
          // 已经预缩放到目标尺寸，直接贴图，零重采样
          ctx.drawImage(e.scaled, sx0, sy0, dw, dh);
        } else if (e && e.ready) {
          ctx.drawImage(e.img, sx0, sy0, dw, dh);
        } else {
          ctx.fillStyle = '#0b1020';
          ctx.fillRect(sx0, sy0, dw, dh);
        }
      }
    }

    // 角色按脚底 Y 排序（近处后画）
    const drawList = this.actors.slice().sort((a, b) => (a.ry ?? a.y) - (b.ry ?? b.y));
    drawList.forEach((a) => this._drawActor(a, camL, camT));

    // 调试信息放到右下角，别挡住左上角的角色卡
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '11px monospace';
    let p95 = 0;
    if (this.costSamples.length > 10) {
      const s = [...this.costSamples].sort((a, b) => a - b);
      p95 = s[Math.floor(s.length * 0.95)] || 0;
    }
    // 放在底部中间的空档（左边是摇杆、右边是技能轮盘）
    const dbgX = 320;
    const dbgY = this.vh - 26;
    ctx.fillText(`FPS ${this.fpsCounter.value}  ${p95.toFixed(1)}ms  ${this.mapDef.group} ${this.mapDef.cellsW}x${this.mapDef.cellsH}`, dbgX, dbgY);
    if (this.self) {
      ctx.fillText(`格 ${this.self.rx.toFixed(1)},${this.self.ry.toFixed(1)}`, dbgX, dbgY + 14);
    }
  }

  _drawActor(a, camL, camT) {
    const { ctx, zoom } = this;
    // 用渲染坐标（平滑位置），不用逻辑坐标
    const px = ((a.rx ?? a.x) * CELL_W - camL) * zoom;
    const py = ((a.ry ?? a.y) * CELL_H - camT) * zoom;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;   // 坐标算不出来就跳过，别让 canvas 报错

    if (a.sprite) {
      const img = a.sprite.image();
      if (img) {
        const key = `${a.sprite.action}_${a.sprite.dir}`;
        const list = a.sprite.framesOf(key);

        // 优先用官方图集数据：每帧的精确矩形 + 锚点偏移
        if (list && list.length) {
          const refH = a.sprite.refHeight(key, list);
          const s = (a.sprite.targetHeight * zoom) / refH;   // 整张图集共用一个缩放，保证帧间对齐
          const f = list[a.sprite.frame % list.length];
          ctx.drawImage(
            img,
            f.sx, f.sy, f.sw, f.sh,
            px + f.ox * s, py + f.oy * s, f.sw * s, f.sh * s,
          );
          return;
        }

        // 没有 json 时退回图像分析
        const cell = a.sprite.cell(img, a.sprite.frame);
        const s = (a.sprite.targetHeight * zoom) / cell.sh;
        ctx.drawImage(
          img,
          cell.sx, cell.sy, cell.sw, cell.sh,
          px - cell.ox * s, py - cell.oy * s, cell.sw * s, cell.sh * s,
        );
        return;
      }
    }

    // 占位：发光圆点 + 影子
    ctx.beginPath();
    ctx.ellipse(px, py, 6, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px, py - 8, 5, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(px, py - 8, 1, px, py - 8, 6);
    g.addColorStop(0, '#ffe082');
    g.addColorStop(1, 'rgba(212,175,55,0)');
    ctx.fillStyle = g;
    ctx.fill();
  }
}
