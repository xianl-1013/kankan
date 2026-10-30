/**
 * 虚拟摇杆（触屏 / 鼠标通用）
 *
 * 输出 8 方向，与 Crystal 的 MirDirection 对齐：
 *   Up=0, UpRight=1, Right=2, DownRight=3, Down=4, DownLeft=5, Left=6, UpLeft=7
 */

export const DIR_VEC = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

export class Joystick {
  /**
   * @param {HTMLElement} el 摇杆容器（内部需有 .knob 元素）
   * @param {{onChange?:(dir:number)=>void}} opts dir 为 -1 表示松开
   */
  constructor(el, { onChange } = {}) {
    this.el = el;
    // 怒战原版 RockerUI 里摇杆头叫 .rk-ball（旧的 .knob 保留兼容）
    this.knob = el.querySelector('.rk-ball') || el.querySelector('.knob');
    this.onChange = onChange || (() => {});
    this.active = false;
    this.dir = -1;
    this.pendingDir = -1;
    this.pendingCount = 0;
    this.pointerId = null;
    this.originX = 0;
    this.originY = 0;
    this.deadZone = 12;
    this.maxRadius = 46;
    // 摇杆容器可能被 CSS 缩放过（怒战走摇杆 scale(0.8)），
    // 指针位移是屏幕像素，要换算回容器内部坐标才能正确推球。
    this.knobScale = 1;
    // 走/跑双速：推到 72% 以上开始跑，回落到 55% 以下才停跑（滞后，避免边界抖动）
    this.running = false;
    this.runOn = 0.72;
    this.runOff = 0.55;
    this.strength = 0;
    this._bind();
  }

  _bind() {
    const el = this.el;

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pointerId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件没有真实指针 */ }
      const r = el.getBoundingClientRect();
      this.originX = r.left + r.width / 2;
      this.originY = r.top + r.height / 2;
      // 屏幕尺寸 / 布局尺寸 = 该元素被 CSS 放大的倍数
      this.knobScale = el.offsetWidth ? r.width / el.offsetWidth : 1;
      this.active = true;
      this._move(e.clientX, e.clientY);
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.active || e.pointerId !== this.pointerId) return;
      e.preventDefault();
      this._move(e.clientX, e.clientY);
    });

    const release = (e) => {
      if (!this.active || (this.pointerId !== null && e.pointerId !== this.pointerId)) return;
      this.active = false;
      this.pointerId = null;
      this.dir = -1;
      this.running = false;
      this.strength = 0;
      // 摇杆头是绝对定位（left/top 已定好位置），复位就是把位移清成 0，
      // 不能写 translate(-50%,-50%) —— 那是假定它用 left:50%/top:50% 居中。
      this.knob.style.transform = 'translate(0px, 0px)';
      this.onChange(-1, false);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
  }

  _move(cx, cy) {
    let dx = cx - this.originX;
    let dy = cy - this.originY;
    const len = Math.hypot(dx, dy);

    if (len > this.maxRadius) {
      dx = (dx / len) * this.maxRadius;
      dy = (dy / len) * this.maxRadius;
    }
    // 容器的 CSS 缩放会再乘一次，所以先换算回容器内部单位
    const s = this.knobScale || 1;
    this.knob.style.transform = `translate(${dx / s}px, ${dy / s}px)`;

    if (len < this.deadZone) {
      if (this.dir !== -1) {
        this.dir = -1;
        this.running = false;
        this.strength = 0;
        this.onChange(-1, false);
      }
      return;
    }

    // 推杆距离决定走/跑
    this.strength = Math.min(1, len / this.maxRadius);
    const wasRunning = this.running;
    if (!this.running && this.strength >= this.runOn) this.running = true;
    else if (this.running && this.strength < this.runOff) this.running = false;
    // 视觉上的 .running 类由 app.js 统一管理（要合并「跑」按钮的状态）

    // 屏幕坐标 y 向下，tan2 得到角度后按 45° 一档取整
    const angle = Math.atan2(dy, dx);
    const d = (((Math.round(angle / (Math.PI / 4)) + 2) % 8) + 8) % 8;

    if (d === this.dir) {
      this.pendingDir = -1;
      this.pendingCount = 0;
      // 方向没变但走/跑状态变了，也要通知
      if (wasRunning !== this.running) this.onChange(this.dir, this.running);
      return;
    }

    // 方向防抖：手指在 45° 边界上抖动会让方向来回跳，
    // 角色就会在几个朝向之间疯狂转（看起来在转圈）。
    // 要求连续 2 次都检测到同一新方向才真正切换。
    if (d === this.pendingDir) {
      this.pendingCount++;
    } else {
      this.pendingDir = d;
      this.pendingCount = 1;
    }

    // 从松开状态开始拖，第一次立即生效
    if (this.dir === -1 || this.pendingCount >= 2) {
      this.dir = d;
      this.pendingDir = -1;
      this.pendingCount = 0;
      this.onChange(d, this.running);
    }
  }
}
