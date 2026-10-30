/**
 * 测松手后的滑行距离：松开瞬间的渲染坐标 vs 600ms 后的最终坐标。
 * 用法: node cdp-slide-test.js <url> <输出png>
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

  const state = async () => JSON.parse(await ev(
    'JSON.stringify({log:[window.__renderer.self.x,window.__renderer.self.y],ren:[+window.__renderer.self.rx.toFixed(3),+window.__renderer.self.ry.toFixed(3)]})'));

  async function trial(name, joy, v, ms) {
    const tx = joy.cx + v[0] * 42;
    const ty = joy.cy + v[1] * 42;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: joy.cx, y: joy.cy, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty, button: 'left', buttons: 1 });
    await sleep(ms);

    const atRelease = await state();
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(600);
    const after = await state();

    const slide = Math.hypot(after.ren[0] - atRelease.ren[0], after.ren[1] - atRelease.ren[1]);
    const lagAtRelease = Math.hypot(atRelease.ren[0] - atRelease.log[0], atRelease.ren[1] - atRelease.log[1]);
    console.log(`[${name}] 松手时滞后 ${lagAtRelease.toFixed(3)} 格  滑行 ${slide.toFixed(3)} 格  ${slide < 0.25 ? '✅ 不明显' : '❌ 还在滑'}`);
    return slide;
  }

  const w = await trial('走摇杆', meta.walk, [0, -1], 1500);
  await sleep(900);
  const r = await trial('跑摇杆', meta.run, [0, 1], 1500);

  console.log(`\n走滑行 ${w.toFixed(3)} 格，跑滑行 ${r.toFixed(3)} 格`);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng);

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
