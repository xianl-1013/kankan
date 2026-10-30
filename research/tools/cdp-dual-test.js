/**
 * 验证双摇杆：左走右跑，对比速度和性能。
 * 用法: node cdp-dual-test.js <url> <输出png>
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
    if (await ev('!!(window.__renderer && window.__renderer.collision && window.__jsWalk && window.__jsRun)')) break;
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
  console.log('走摇杆中心', meta.walk, ' 跑摇杆中心', meta.run);

  const pos = async () => JSON.parse(await ev('JSON.stringify([window.__renderer.self.x, window.__renderer.self.y])'));
  const perf = async () => JSON.parse(await ev(`(() => {
    const s = [...window.__renderer.costSamples].sort((a,b)=>a-b);
    return JSON.stringify({ p50: +(s[Math.floor(s.length*0.5)]||0).toFixed(2), p95: +(s[Math.floor(s.length*0.95)]||0).toFixed(2), n: s.length });
  })()`));

  async function trial(name, joy, dirVec, ms) {
    await ev('window.__renderer.costSamples.length = 0');   // 清空性能样本
    const before = await pos();
    const tx = joy.cx + dirVec[0] * 42;
    const ty = joy.cy + dirVec[1] * 42;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: joy.cx, y: joy.cy, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty, button: 'left', buttons: 1 });
    await sleep(ms);
    const p = await perf();
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(300);
    const after = await pos();
    const dist = Math.hypot(after[0] - before[0], after[1] - before[1]);
    console.log(`[${name}] ${before} -> ${after}  移动 ${dist.toFixed(0)} 格 (${(dist/(ms/1000)).toFixed(1)} 格/秒)  帧耗时 p50=${p.p50}ms p95=${p.p95}ms`);
    return dist;
  }

  const d = [0.7, 0.7];
  const walk = await trial('走摇杆', meta.walk, d, 2000);
  await sleep(700);
  const run = await trial('跑摇杆', meta.run, d, 2000);

  console.log(`\n速度比 = ${(run / Math.max(walk, 0.001)).toFixed(2)}`);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng);

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
