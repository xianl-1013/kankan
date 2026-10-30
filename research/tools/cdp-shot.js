/**
 * 用 Chrome DevTools Protocol 控制无头浏览器：导航 -> 等待条件 -> 截图。
 * 不依赖 playwright，只用 ws（h5client 已装）。
 *
 * 用法:
 *   node cdp-shot.js <url> <输出png> [等待的JS表达式] [超时毫秒]
 * 例:
 *   node cdp-shot.js "http://127.0.0.1:8080/?acc=test123&pwd=177587&auto=1" out.png \
 *        "window.__debug && window.__debug.state.inGame" 30000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'h5client', 'node_modules', 'ws'));

const [url, outPng, waitExpr = 'true', timeoutMs = '20000'] = process.argv.slice(2);
const CDP_PORT = 9222;
const TIMEOUT = Number(timeoutMs);

function httpJson(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: CDP_PORT, path: p }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  // 找一个 page target
  let targets = await httpJson('/json/list');
  let page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有可用的 page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  const events = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
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
  await send('Console.enable').catch(() => {});

  // 收集控制台日志
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      console.log('[console]', args);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log('[异常]', JSON.stringify(msg.params.exceptionDetails.exception?.description || '').slice(0, 300));
    }
  });

  await send('Page.navigate', { url });

  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < TIMEOUT) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const r = await send('Runtime.evaluate', {
        expression: `!!(${waitExpr})`, returnByValue: true,
      });
      if (r.result && r.result.value === true) { ok = true; break; }
    } catch (e) { /* 页面还没准备好 */ }
  }
  console.log(ok ? '[等待] 条件满足' : '[等待] 超时，仍截图');

  // 让渲染多跑几帧
  await new Promise((r) => setTimeout(r, 1200));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('[截图]', outPng, fs.statSync(outPng).size, '字节');

  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
