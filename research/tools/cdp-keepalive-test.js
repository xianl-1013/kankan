/**
 * 验证：登录 -> 移动 -> 保持 30 秒不掉线（检验心跳包是否有效）。
 * 用法: node cdp-keepalive-test.js <url> <输出png>
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
      console.log('[异常]', (d.exception && d.exception.description || d.text || '').slice(0, 160));
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
  await sleep(1500);
  console.log('[1] 已进游戏');

  // 移动 2 秒
  const meta = JSON.parse(await ev(`(() => {
    const a = document.getElementById('joystick-walk').getBoundingClientRect();
    return JSON.stringify({ cx: a.left + a.width/2, cy: a.top + a.height/2 });
  })()`));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: meta.cx, y: meta.cy, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(30);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: meta.cx, y: meta.cy - 42, button: 'left', buttons: 1 });
  await sleep(2000);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: meta.cx, y: meta.cy - 42, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(300);

  const pos = await ev('JSON.stringify([window.__debug.state.nzX, window.__debug.state.nzY])');
  console.log('[2] 移动完成，位置', pos);

  const check = async (label) => {
    const s = await ev('JSON.stringify({connected: window.__debug.sock.connected, inGame: window.__debug.state.inGame})');
    console.log(`[${label}]`, s);
    return JSON.parse(s);
  };

  await check('3] 移动后 0 秒');

  // 静置 30 秒，看心跳是否有效
  for (let i = 1; i <= 6; i++) {
    await sleep(5000);
    const st = await check(`4.${i}] 静置 ${i * 5} 秒`);
    if (!st.connected || !st.inGame) {
      console.log('❌ 掉线了！');
      break;
    }
  }

  const final = await check('5] 最终状态');
  console.log(final.connected && final.inGame ? '✅ 30 秒未掉线，心跳有效' : '❌ 连接已断');

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng);

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
