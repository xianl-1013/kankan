/**
 * 直接连桥接层测走路：登录 -> 进游戏 -> 依次尝试 8 个方向
 * 观察服务端是否接受移动（UserLocation 坐标是否变化）
 */
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');

const CLIENT_EXE = 'C:/Users/sjy/mir2-test/Crystal/Build/Client/Release/Client.exe';
const HASH = crypto.createHash('md5').update(fs.readFileSync(CLIENT_EXE)).digest();

const DIR_NAMES = ['上', '右上', '右', '右下', '下', '左下', '左', '左上'];

function pkt(id, payload = Buffer.alloc(0)) {
  const b = Buffer.alloc(4 + payload.length);
  b.writeUInt16LE(4 + payload.length, 0);
  b.writeInt16LE(id, 2);
  payload.copy(b, 4);
  return b;
}
function str(s) {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([Buffer.from([b.length]), b]);
}

const ws = new WebSocket('ws://127.0.0.1:8080/ws');
let phase = 'connect';
let lastPos = null;

ws.on('open', () => console.log('[ws] 已连上桥接'));

ws.on('message', (data, isBinary) => {
  if (!isBinary) return;
  const buf = Buffer.from(data);
  const len = buf.readUInt16LE(0);
  const id = buf.readInt16LE(2);
  const p = buf.subarray(4, len);

  if (id === 0 && phase === 'connect') {
    phase = 'version';
    ws.send(pkt(0, Buffer.concat([Buffer.from([16, 0, 0, 0]), HASH])));
  } else if (id === 1 && phase === 'version') {
    phase = 'login';
    ws.send(pkt(5, Buffer.concat([str('test123'), str('177587')])));
  } else if (id === 9 && phase === 'login') {
    const cnt = p.readInt32LE(0);
    const idx = cnt ? p.readInt32LE(4) : 0;
    phase = 'game';
    console.log('[登录成功] 角色数', cnt, '选 #' + idx);
    ws.send(pkt(8, (() => { const b = Buffer.alloc(4); b.writeInt32LE(idx, 0); return b; })()));
  } else if (id === 14 && phase === 'game') {
    phase = 'in';
    console.log('[进游戏成功] 等 2 秒后开始测走路');
    setTimeout(runWalkTest, 2000);
  } else if (id === 23) {
    const x = p.readInt32LE(0);
    const y = p.readInt32LE(4);
    const d = p[8];
    lastPos = { x, y, d };
    console.log(`  <- UserLocation ${x},${y} 方向${DIR_NAMES[d] || d}`);
  } else if (id === 28) { // ObjectWalk
    console.log('  <- ObjectWalk');
  }
});

let dirIdx = 0;
function runWalkTest() {
  if (dirIdx >= 8) {
    console.log('\n[测试完成] 最终位置', lastPos);
    ws.close();
    process.exit(0);
  }
  const d = dirIdx++;
  console.log(`\n[发] Walk 方向${DIR_NAMES[d]}(${d})  当前 ${lastPos ? `${lastPos.x},${lastPos.y}` : '?'}`);
  ws.send(pkt(11, Buffer.from([d])));
  setTimeout(() => {
    // 再发一次，确认是否被拒
    ws.send(pkt(11, Buffer.from([d])));
    setTimeout(runWalkTest, 900);
  }, 900);
}

ws.on('error', (e) => console.log('[错误]', e.message));
setTimeout(() => { console.log('\n[超时] 结束'); process.exit(0); }, 30000);
