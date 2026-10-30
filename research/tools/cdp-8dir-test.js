/**
 * 依次尝试 8 个方向，找出能走的方向，并在能走的方向上采样平滑性。
 * 用法: node cdp-8dir-test.js <url> <输出png>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'h5client', 'node_modules', 'ws'));

const [url, outPng] = process.argv.slice(2);
const CDP_PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// MirDirection: 屏幕上 dy 向下为正
const DIRS = [
  { d: 0, name: '上', v: [0, -1] },
  { d: 1, name: '右上', v: [0.7, -0.7] },
  { d: 2, name: '右', v: [1, 0] },
  { d: 3, name: '右下', v: [0.7, 0.7] },
  { d: 4, name: '下', v: [0, 1] },
  { d: 5, name: '左下', v: [-0.7, 0.7] },
  { d: 6, name: '左', v: [-1, 0] },
  { d: 7, name: '左上', v: [-0.7, -0.7] },
];

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
      const txt = (d.exception && d.exception.description || d.text || '');
      if (!/createRadialGradient|ellipse/.test(txt)) console.log('[异常]', txt.slice(0, 180));
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
    return JSON.stringify({ cx: r.left + r.width/2, cy: r.top + r.height/2 });
  })()`));

  const posNow = async () => JSON.parse(await evalJs(
    'JSON.stringify([window.__renderer.self.x, window.__renderer.self.y])'));

  console.log('起始位置', await posNow());

  const results = [];
  for (const dir of DIRS) {
    const before = await posNow();
    const tx = meta.cx + dir.v[0] * 44;
    const ty = meta.cy + dir.v[1] * 44;

    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: meta.cx, y: meta.cy, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty, button: 'left', buttons: 1 });
    await sleep(1600);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(350);

    const after = await posNow();
    const moved = (after[0] - before[0]) + (after[1] - before[1]);
    results.push({ ...dir, before, after, moved });
    console.log(`${dir.name}(${dir.d})  ${before.join(',')} -> ${after.join(',')}  ${moved !== 0 ? '✅ 可走' : '❌ 被挡'}`);
  }

  const walkable = results.filter((r) => r.moved !== 0);
  console.log(`\n可走方向: ${walkable.map((r) => r.name).join(' ') || '无'}`);

  // 在能走的方向上做平滑性采样
  if (walkable.length) {
    const dir = walkable[0];
    const tx = meta.cx + dir.v[0] * 44;
    const ty = meta.cy + dir.v[1] * 44;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: meta.cx, y: meta.cy, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty, button: 'left', buttons: 1 });

    const samples = [];
    for (let i = 0; i < 30; i++) {
      const s = await evalJs(`JSON.stringify({
        log: [window.__debug.state.player.mx, window.__debug.state.player.my],
        ren: [+window.__renderer.self.rx.toFixed(3), +window.__renderer.self.ry.toFixed(3)],
        dir: window.__renderer.self.sprite.dir,
      })`);
      if (s) samples.push(JSON.parse(s));
      await sleep(80);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', buttons: 0, clickCount: 1 });

    let maxJump = 0;
    let backward = 0;
    const dirs = new Set();
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const step = Math.hypot(b.ren[0] - a.ren[0], b.ren[1] - a.ren[1]);
      if (step > maxJump) maxJump = step;
      dirs.add(b.dir);
      // 渲染坐标相对该方向是否倒退
      const dot = (b.ren[0] - a.ren[0]) * dir.v[0] + (b.ren[1] - a.ren[1]) * dir.v[1];
      if (dot < -0.02) backward++;
    }
    console.log(`\n[平滑性] 方向=${dir.name}`);
    console.log(`  轨迹: ${samples.slice(0, 8).map((s) => `(${s.ren.join(',')})`).join(' ')}`);
    console.log(`  最大单帧位移 ${maxJump.toFixed(3)} 格   ${maxJump < 0.5 ? '✅ 无瞬移' : '❌ 有瞬移'}`);
    console.log(`  倒退帧数 ${backward}   ${backward === 0 ? '✅ 无回退抖动' : '❌ 有抖动'}`);
    console.log(`  精灵方向集合 {${[...dirs].join(',')}}   ${dirs.size === 1 ? '✅ 方向稳定' : '❌ 方向在变（转圈）'}`);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
  console.log('\n[截图]', outPng);

  ws.close();
  process.exit(0);
})().catch((e) => { console.error('[错误]', e.message); process.exit(1); });
