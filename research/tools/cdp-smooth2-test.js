/**
 * 测走/跑的平滑度：高频采样渲染坐标，算每段位移的变异系数。
 * 变异系数越小越平滑（匀速移动），越大说明走走停停。
 * 用法: node cdp-smooth2-test.js <url> <输出png>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'h5client', 'node_modules', 'ws'));

const [url, outPng] = process.argv.slice(2);
const CDP_PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  const targets = await httpJson('/json/list');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });

  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  });
  await new Promise((r) => ws.on('open', r));

  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });

  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await ev('!!(window.__renderer && window.__renderer.collision && window.__jsWalk)')) break;
  }
  await sleep(1800);

  const meta = JSON.parse(await ev(`(() => {
    const a = document.getElementById('joystick-walk').getBoundingClientRect();
    const b = document.getElementById('joystick-run').getBoundingClientRect();
    return JSON.stringify({
      walk: { cx: a.left + a.width/2, cy: a.top + a.height/2 },
      run:  { cx: b.left + b.width/2, cy: b.top + b.height/2 },
    });
  })()`));

  /**
   * @param {string} name
   * @param {{cx:number,cy:number}} joy
   * @param {number[]} v 方向向量（屏幕坐标）
   * @param {number} ms 持续时长
   */
  async function trial(name, joy, v, ms) {
    const before = JSON.parse(await ev('JSON.stringify([window.__renderer.self.rx, window.__renderer.self.ry])'));
    const tx = joy.cx + v[0] * 42;
    const ty = joy.cy + v[1] * 42;

    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: joy.cx, y: joy.cy, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty, button: 'left', buttons: 1 });

    // 高频采样渲染坐标
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = JSON.parse(await ev('JSON.stringify([window.__renderer.self.rx, window.__renderer.self.ry])'));
      samples.push({ t: Date.now() - t0, x: s[0], y: s[1] });
      await sleep(20);
    }

    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(300);

    const after = JSON.parse(await ev('JSON.stringify([window.__renderer.self.rx, window.__renderer.self.ry])'));
    const dist = Math.hypot(after[0] - before[0], after[1] - before[1]);

    // 忽略前 300ms（起步加速）和最后 200ms
    const tStart = 300;
    const tEnd = ms - 200;
    const steps = [];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (a.t < tStart || b.t > tEnd) continue;
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0) continue;
      steps.push(Math.hypot(b.x - a.x, b.y - a.y) / dt);   // 瞬时速度 格/秒
    }

    const mean = steps.reduce((s, x) => s + x, 0) / Math.max(1, steps.length);
    const variance = steps.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, steps.length);
    const std = Math.sqrt(variance);
    const cv = mean > 0.01 ? std / mean : 0;   // 变异系数

    console.log(`[${name}] 移动 ${dist.toFixed(0)} 格  平均 ${mean.toFixed(2)} 格/秒  波动 ${std.toFixed(2)}  CV=${cv.toFixed(3)} ${cv < 0.35 ? '✅ 平滑' : '❌ 顿挫'}`);
    return { dist, mean, cv };
  }

  // 从出生点 (45,36)：先往上走，再往下跑（都是开阔的法阵区域）
  const walk = await trial('走', meta.walk, [0, -1], 2000);
  await sleep(800);
  const run = await trial('跑', meta.run, [0, 1], 2000);

  console.log(`\n速度比 = ${(run.mean / Math.max(walk.mean, 0.001)).toFixed(2)}`);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng);

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
