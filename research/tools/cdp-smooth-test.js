/**
 * 验证移动平滑性：拖住摇杆，每 80ms 采样一次位置，
 * 检查渲染坐标是否连续（没有瞬移/分身/回退抖动）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'h5client', 'node_modules', 'ws'));

const [url, outPng, dirName = 'left'] = process.argv.slice(2);
const CDP_PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

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
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log('[异常]', (d.exception && d.exception.description || d.text || '').slice(0, 200));
    }
  });
  await new Promise((r) => ws.on('open', r));

  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });

  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await evalJs('!!(window.__renderer && window.__renderer.mapDef && window.__debug.state.player && window.__joystick)')) break;
  }
  await sleep(1200);

  const meta = JSON.parse(await evalJs(`(() => {
    const r = document.getElementById('joystick').getBoundingClientRect();
    return JSON.stringify({ cx: r.left + r.width/2, cy: r.top + r.height/2 });
  })()`));

  const [vx, vy] = VEC[dirName] || VEC.left;
  const toX = meta.cx + vx * 44;
  const toY = meta.cy + vy * 44;

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: meta.cx, y: meta.cy, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: toX, y: toY, button: 'left', buttons: 1 });

  // 采样 3 秒
  const samples = [];
  for (let i = 0; i < 38; i++) {
    const s = await evalJs(`JSON.stringify({
      log: [window.__debug.state.player.mx, window.__debug.state.player.my],
      ren: [+window.__renderer.self.rx.toFixed(2), +window.__renderer.self.ry.toFixed(2)],
      dir: window.__renderer.self.sprite.dir,
      act: window.__renderer.self.sprite.action,
    })`);
    if (s) samples.push(JSON.parse(s));
    await sleep(80);
  }

  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(400);

  // 分析：渲染坐标的每步位移
  let maxJump = 0;
  let reversals = 0;
  let prevDelta = null;
  const dirSet = new Set();
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].ren;
    const b = samples[i].ren;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > maxJump) maxJump = d;
    if (prevDelta && d > 0.01 && prevDelta > 0.01) {
      // 判断方向是否反转
      const pa = samples[i - 1].ren.map((v, k) => v - samples[i - 2] ? v - samples[i - 2].ren[k] : 0);
      const denom = Math.hypot(pa[0], pa[1]) * d;
      if (denom > 0.001) {
        const cos = (pa[0] * (b[0] - a[0]) + pa[1] * (b[1] - a[1])) / denom;
        if (cos < -0.3) reversals++;
      }
    }
    prevDelta = d;
    dirSet.add(samples[i].dir);
  }

  console.log(`[采样] ${samples.length} 帧`);
  console.log('[前10帧]', samples.slice(0, 10).map((s) => `${s.ren.join(',')}(逻辑${s.log.join(',')})`).join('  '));
  console.log(`[最大单帧位移] ${maxJump.toFixed(3)} 格  (应 < 0.6, 超过说明有瞬移)`);
  console.log(`[方向反转次数] ${reversals}  (应 = 0, 大于 0 说明在抖动)`);
  console.log(`[出现过的精灵方向] ${[...dirSet].join(',')}  (应只有一个)`);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng);

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
