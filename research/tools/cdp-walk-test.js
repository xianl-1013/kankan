/**
 * 测试走路：进游戏后按住方向键，观察坐标变化并截图。
 * 用法: node cdp-walk-test.js <url> <输出png>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'h5client', 'node_modules', 'ws'));

const [url, outPng] = process.argv.slice(2);
const CDP_PORT = 9222;

function httpJson(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const targets = await httpJson('/json/list');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });

  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (/坐标映射|角色|地图|走路|Walk/.test(args)) console.log('[console]', args);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      console.log('[异常]', (d.exception && d.exception.description || d.text || '').slice(0, 200));
    }
  });
  await new Promise((r) => ws.on('open', r));

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  // 无头页面必须先置于前台，否则 Input.dispatchKeyEvent 会被丢弃
  await send('Page.bringToFront').catch(() => {});
  await send('Page.navigate', { url });
  await send('Page.bringToFront').catch(() => {});

  // 等进游戏
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', {
      expression: '!!(window.__renderer && window.__renderer.mapDef && window.__debug.state.player)',
      returnByValue: true,
    }).catch(() => null);
    if (r && r.result && r.result.value) break;
  }
  console.log("[状态] 已进游戏"); await sleep(3000);

  const before = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__debug.state.player)',
    returnByValue: true,
  });
  console.log('[之前]', before.result.value);

  // 按住 D（右）3 秒（用 CDP 真实按键，合成事件不可靠）
  const KEY_D = { key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...KEY_D });
  await sleep(3000);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...KEY_D });
  await sleep(600);

  const after = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({p:window.__debug.state.player, r:{x:window.__renderer.self.x,y:window.__renderer.self.y}})',
    returnByValue: true,
  });
  console.log('[之后]', after.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng, fs.statSync(outPng).size, '字节');

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
