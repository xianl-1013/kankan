/**
 * 验证摇杆走/跑双速：同样按 1.5 秒，跑应该移动约两倍距离。
 * 用法: node cdp-walkrun-test.js <url> <输出png>
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
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });

  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await evalJs('!!(window.__renderer && window.__renderer.collision && window.__joystick)')) break;
  }
  await sleep(1800);

  const meta = JSON.parse(await evalJs(`(() => {
    const r = document.getElementById('joystick').getBoundingClientRect();
    return JSON.stringify({ cx: r.left + r.width/2, cy: r.top + r.height/2 });
  })()`));
  const pos = async () => JSON.parse(await evalJs('JSON.stringify([window.__renderer.self.x, window.__renderer.self.y])'));

  async function trial(name, pushPx, dirVec, ms) {
    const before = await pos();
    const tx = meta.cx + dirVec[0] * pushPx;
    const ty = meta.cy + dirVec[1] * pushPx;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: meta.cx, y: meta.cy, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty, button: 'left', buttons: 1 });
    await sleep(ms);
    const running = await evalJs('window.__joystick.running');
    const strength = await evalJs('+window.__joystick.strength.toFixed(2)');
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(350);
    const after = await pos();
    const dist = Math.hypot(after[0] - before[0], after[1] - before[1]);
    console.log(`[${name}] 推杆${pushPx}px 力度${strength} 跑步=${running}  ${before}->${after}  移动 ${dist.toFixed(0)} 格`);
    return dist;
  }

  // 往右下方向试（那片区域开阔）
  const d = [0.7, 0.7];
  const walk = await trial('走', 22, d, 1500);
  await sleep(600);
  const run = await trial('跑', 46, d, 1500);

  console.log(`\n跑/走速度比 = ${(run / Math.max(walk, 0.001)).toFixed(2)}  (期望 ≈ 2)`);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng);

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
