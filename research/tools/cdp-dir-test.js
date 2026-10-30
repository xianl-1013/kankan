/**
 * 测试虚拟摇杆 + 角色朝向。
 * 用法: node cdp-joystick-test.js <url> <输出png>
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
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log('[异常]', (d.exception && d.exception.description || d.text || '').slice(0, 240));
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const args = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (/Walk|UserLocation|摇杆|坐标/.test(args)) console.log('[console]', args);
    }
  });
  await new Promise((r) => ws.on('open', r));

  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      console.log('[eval异常]', JSON.stringify(r.exceptionDetails).slice(0, 300));
    }
    return r.result && r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });

  // 等进游戏
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (await evalJs('!!(window.__renderer && window.__renderer.mapDef && window.__debug.state.player && window.__joystick)')) break;
  }
  await sleep(1500);
  console.log('[状态] 已进游戏');

  const info = await evalJs(`(() => {
    const el = document.getElementById('joystick');
    const r = el.getBoundingClientRect();
    return JSON.stringify({
      rect: {x: r.left, y: r.top, w: r.width, h: r.height},
      cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      player: window.__debug.state.player,
      spriteDir: window.__renderer.self.sprite.dir,
      spriteAction: window.__renderer.self.sprite.action,
    });
  })()`);
  console.log('[初始]', info);
  const meta = JSON.parse(info);

  // 摇杆向下拖 40px（dir 应为 4 = Down）
  await evalJs(`(() => {
    const el = document.getElementById('joystick');
    const cx = ${meta.cx}, cy = ${meta.cy};
    const mk = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
    mk('pointerdown', cx, cy);
    mk("pointermove", cx, cy - 42);
    return window.__joystick.dir;
  })()`).then((v) => console.log('[摇杆dir]', v));

  await sleep(2500);

  const during = await evalJs(`JSON.stringify({
    jdir: window.__joystick.dir,
    player: window.__debug.state.player,
    self: {x: window.__renderer.self.x, y: window.__renderer.self.y},
    spriteDir: window.__renderer.self.sprite.dir,
    spriteAction: window.__renderer.self.sprite.action,
  })`);
  console.log('[按住中]', during);

  // 松开
  await evalJs(`(() => {
    const el = document.getElementById('joystick');
    el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: ${meta.cx}, clientY: ${meta.cy - 42}, bubbles: true }));
  })()`);
  await sleep(600);

  const after = await evalJs(`JSON.stringify({
    jdir: window.__joystick.dir,
    spriteAction: window.__renderer.self.sprite.action,
  })`);
  console.log('[松开后]', after);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng, fs.statSync(outPng).size, '字节');

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
