/**
 * 用真实鼠标事件拖动摇杆，验证走路。
 * 用法: node cdp-drag-test.js <url> <输出png> [方向 up|down|left|right]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'h5client', 'node_modules', 'ws'));

const [url, outPng, dirName = 'up'] = process.argv.slice(2);
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
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const a = (m.params.args || []).map((x) => x.value ?? x.description ?? '').join(' ');
      if (/Walk|UserLocation|摇杆/.test(a)) console.log('[console]', a);
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
  await sleep(1500);

  const meta = JSON.parse(await evalJs(`(() => {
    const r = document.getElementById('joystick').getBoundingClientRect();
    return JSON.stringify({
      cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      player: window.__debug.state.player,
    });
  })()`));
  console.log('[初始]', JSON.stringify(meta.player), `摇杆中心 ${meta.cx},${meta.cy}`);

  const [vx, vy] = VEC[dirName] || VEC.up;
  const fromX = meta.cx;
  const fromY = meta.cy;
  const toX = fromX + vx * 44;
  const toY = fromY + vy * 44;

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: toX, y: toY, button: 'left', buttons: 1 });
  await sleep(2800);

  const during = await evalJs(`JSON.stringify({
    jdir: window.__joystick.dir,
    player: window.__debug.state.player,
    spriteDir: window.__renderer.self.sprite.dir,
    spriteAction: window.__renderer.self.sprite.action,
  })`);
  console.log('[拖拽中]', during);

  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(500);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng);

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
