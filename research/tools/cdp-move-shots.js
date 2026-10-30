/**
 * 移动中连续截图，用于检查动画帧是否有分身/错位。
 * 用法: node cdp-move-shots.js <url> <输出前缀> [方向]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'h5client', 'node_modules', 'ws'));

const [url, prefix, dirName = 'up'] = process.argv.slice(2);
const CDP_PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  upleft: [-0.7, -0.7], upright: [0.7, -0.7], downleft: [-0.7, 0.7], downright: [0.7, 0.7] };

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
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const a = (m.params.args || []).map((x) => x.value ?? x.description ?? '').join(' ');
      if (/图集/.test(a)) console.log('[console]', a);
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
    if (await evalJs('!!(window.__renderer && window.__renderer.mapDef && window.__renderer.collision)')) break;
  }
  await sleep(2000);

  const meta = JSON.parse(await evalJs(`(() => {
    const r = document.getElementById('joystick').getBoundingClientRect();
    return JSON.stringify({ cx: r.left + r.width/2, cy: r.top + r.height/2 });
  })()`));

  const [vx, vy] = VEC[dirName] || VEC.up;
  const toX = meta.cx + vx * 44;
  const toY = meta.cy + vy * 44;

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: meta.cx, y: meta.cy, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: toX, y: toY, button: 'left', buttons: 1 });

  const files = [];
  for (let i = 0; i < 6; i++) {
    await sleep(170);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const f = `${prefix}_${i}.png`;
    fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
    files.push(f);
    const st = await evalJs('JSON.stringify({f:window.__renderer.self.sprite.frame,d:window.__renderer.self.sprite.dir,a:window.__renderer.self.sprite.action})');
    console.log(`[帧${i}]`, st);
  }

  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', buttons: 0, clickCount: 1 });
  console.log('[完成]', files.join(' '));

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
