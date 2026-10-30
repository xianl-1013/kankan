/**
 * 验证 WebSocket 桥接层：完整走一遍 登录 -> 选角 -> 进游戏
 */
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');

const CLIENT_EXE = 'C:/Users/sjy/mir2-test/Crystal/Build/Client/Release/Client.exe';
const HASH = crypto.createHash('md5').update(fs.readFileSync(CLIENT_EXE)).digest();

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
const seen = [];

ws.on('open', () => console.log('[ws] 已连接桥接服务'));

ws.on('message', (data, isBinary) => {
  if (!isBinary) return;  // 桥接层的 JSON 控制消息
  const buf = Buffer.from(data);
  const len = buf.readUInt16LE(0);
  const id = buf.readInt16LE(2);
  const payload = buf.subarray(4, len);
  seen.push(id);
  console.log(`[收] 包ID=${id} 长度=${payload.length}`);

  if (id === 0 && phase === 'connect') {
    phase = 'version';
    ws.send(pkt(0, Buffer.concat([Buffer.from([16, 0, 0, 0]), HASH])));
    console.log('[发] ClientVersion');
  } else if (id === 1 && phase === 'version') {
    phase = 'login';
    console.log(`[发] Login (版本校验=${payload[0]})`);
    ws.send(pkt(5, Buffer.concat([str('test123'), str('177587')])));
  } else if (id === 9 && phase === 'login') {
    const cnt = payload.readInt32LE(0);
    let off = 4;
    const chars = [];
    for (let i = 0; i < cnt; i++) {
      const index = payload.readInt32LE(off); off += 4;
      const n = payload[off]; const name = payload.subarray(off + 1, off + 1 + n).toString('utf8'); off += 1 + n;
      const level = payload.readUInt16LE(off); off += 2;
      off += 2; off += 8;
      chars.push({ index, name, level });
      console.log(`  角色: #${index} ${name} Lv${level}`);
    }
    if (chars.length) {
      phase = 'game';
      console.log(`[发] StartGame ${chars[0].index}`);
      ws.send(pkt(8, (() => { const b = Buffer.alloc(4); b.writeInt32LE(chars[0].index, 0); return b; })()));
    }
  } else if (id === 17) {
    // MapInformation: int32 mapIndex, string fileName, string title
    const mapIndex = payload.readInt32LE(0);
    let off = 4;
    const n1 = payload[off]; const fileName = payload.subarray(off + 1, off + 1 + n1).toString('utf8'); off += 1 + n1;
    const n2 = payload[off]; const title = payload.subarray(off + 1, off + 1 + n2).toString('utf8'); off += 1 + n2;
    console.log(`  地图: ${title} (${fileName}, #${mapIndex})`);
  } else if (id === 30) {
    const n = payload[0];
    console.log(`  聊天: ${payload.subarray(1, 1 + n).toString('utf8')}`);
  }
});

ws.on('close', () => {
  console.log(`\n[结果] 连接关闭，共收到 ${seen.length} 个包`);
  console.log(`       包序列: ${seen.slice(0, 20).join(',')}`);
});
ws.on('error', (e) => console.log('[错误]', e.message));

setTimeout(() => {
  console.log(`\n[结果] 10 秒结束，共收到 ${seen.length} 个包`);
  console.log(`       包序列: ${seen.slice(0, 25).join(',')}`);
  ws.close();
  process.exit(0);
}, 10000);
