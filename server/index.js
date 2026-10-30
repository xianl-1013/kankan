/**
 * Crystal H5 客户端 —— WebSocket ↔ TCP 桥 + 静态文件服务
 *
 * 浏览器只支持 WebSocket，Crystal 服务端是裸 TCP，
 * 这里做双向二进制转发，不解析包内容（解析交给前端）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { WebSocketServer } = require('ws');

const HTTP_PORT = 8080;
const GAME_HOST = '127.0.0.1';
const GAME_PORT = 7000;
const PUBLIC = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

// ---------- 静态文件 ----------
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(data);
  });
});

// ---------- WebSocket 桥 ----------
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[ws] 浏览器已连接，正在连接游戏服…');
  const tcp = net.createConnection({ host: GAME_HOST, port: GAME_PORT });
  let buf = Buffer.alloc(0);

  tcp.on('connect', () => {
    console.log('[tcp] 已连上游戏服', `${GAME_HOST}:${GAME_PORT}`);
    ws.send(JSON.stringify({ type: 'bridge', status: 'connected' }));
  });

  // 游戏服 -> 浏览器
  tcp.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    // 按 <uint16 长度><int16 包ID> 切包，整包发给前端
    while (buf.length >= 4) {
      const len = buf.readUInt16LE(0);
      if (len < 4 || buf.length < len) break;
      const pkt = buf.subarray(0, len);
      buf = buf.subarray(len);
      if (ws.readyState === 1) ws.send(pkt);
    }
  });

  tcp.on('error', (e) => {
    console.log('[tcp] 错误:', e.message);
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'bridge', status: 'error', message: e.message }));
  });
  tcp.on('close', () => {
    console.log('[tcp] 连接关闭');
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'bridge', status: 'closed' }));
  });

  // 浏览器 -> 游戏服（前端发来的已经是完整包）
  ws.on('message', (data, isBinary) => {
    if (!isBinary) return;
    if (!tcp.destroyed) tcp.write(data);
  });

  ws.on('close', () => { console.log('[ws] 浏览器断开'); tcp.destroy(); });
  ws.on('error', () => tcp.destroy());
});

server.listen(HTTP_PORT, () => {
  console.log(`H5 客户端已启动: http://127.0.0.1:${HTTP_PORT}`);
  console.log(`游戏服: ${GAME_HOST}:${GAME_PORT}`);
});
