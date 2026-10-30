/**
 * Crystal 协议（浏览器端）
 *
 * 包格式：<uint16 长度><int16 包ID><数据>
 * 字符串：<uint8 长度><UTF-8>
 */
export const ClientPacketIds = {
  ClientVersion: 0,
  Disconnect: 1,
  KeepAlive: 2,
  NewAccount: 3,
  ChangePassword: 4,
  Login: 5,
  NewCharacter: 6,
  DeleteCharacter: 7,
  StartGame: 8,
  LogOut: 9,
  Turn: 10,
  Walk: 11,
  Run: 12,
  Chat: 13,
};

export const ServerPacketIds = {
  0: 'Connected',
  1: 'ClientVersion',
  2: 'Disconnect',
  3: 'KeepAlive',
  4: 'NewAccount',
  5: 'ChangePassword',
  6: 'ChangePasswordBanned',
  7: 'Login',
  8: 'LoginBanned',
  9: 'LoginSuccess',
  10: 'NewCharacter',
  11: 'NewCharacterSuccess',
  12: 'DeleteCharacter',
  13: 'DeleteCharacterSuccess',
  14: 'StartGame',
  15: 'StartGameBanned',
  16: 'StartGameDelay',
  17: 'MapInformation',
  18: 'NewMapInfo',
  19: 'WorldMapSetup',
  20: 'SearchMapResult',
  21: 'UserInformation',
  22: 'UserSlotsRefresh',
  23: 'UserLocation',
  24: 'ObjectPlayer',
  25: 'ObjectHero',
  26: 'ObjectRemove',
  30: 'Chat',
  32: 'NewItemInfo',
  204: 'NPCUpdate',
};

/** 客户端 exe 的 MD5，服务端用它校验版本 */
export const CLIENT_VERSION_HASH =
  '27f05c503a197d4f0b8b7a187e9fd875';

/** 小端读写工具 */
export class Writer {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }
  u8(v) { return this._raw(new Uint8Array([v & 0xff])); }
  u16(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v & 0xffff, true);
    return this._raw(b);
  }
  i32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v | 0, true);
    return this._raw(b);
  }
  str(s) {
    const bytes = new TextEncoder().encode(s);
    this.u8(bytes.length);
    return this._raw(bytes);
  }
  _raw(bytes) {
    this.chunks.push(bytes);
    this.length += bytes.length;
    return this;
  }
  build(packetId) {
    const total = 4 + this.length;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, total, true);
    dv.setInt16(2, packetId, true);
    let off = 4;
    for (const c of this.chunks) { out.set(c, off); off += c.length; }
    return out;
  }
}

export class Reader {
  constructor(view) {
    this.dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
    this.off = 0;
    this.decoder = new TextDecoder('utf-8');
  }
  u8() { return this.dv.getUint8(this.off++); }
  u16() { const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
  i16() { const v = this.dv.getInt16(this.off, true); this.off += 2; return v; }
  i32() { const v = this.dv.getInt32(this.off, true); this.off += 4; return v; }
  u32() { const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }
  i64() {
    const v = this.dv.getBigInt64(this.off, true);
    this.off += 8;
    return v;
  }
  bool() { return this.u8() !== 0; }
  str() {
    const n = this.u8();
    const bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.off, n);
    this.off += n;
    return this.decoder.decode(bytes);
  }
  get remaining() { return this.dv.byteLength - this.off; }
}

/** 解析服务端包 */
export function parsePacket(buffer) {
  const view = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  const length = dv.getUint16(0, true);
  const id = dv.getInt16(2, true);
  if (length < 4 || length > view.length) return null;
  return { id, name: ServerPacketIds[id] || `#${id}`, payload: view.subarray(4, length) };
}

export function buildClientVersion() {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(CLIENT_VERSION_HASH.substr(i * 2, 2), 16);
  }
  const w = new Writer();
  w.i32(bytes.length)._raw(bytes);
  return w.build(ClientPacketIds.ClientVersion);
}

export function buildLogin(account, password) {
  return new Writer().str(account).str(password).build(ClientPacketIds.Login);
}

export function buildStartGame(characterIndex) {
  return new Writer().i32(characterIndex).build(ClientPacketIds.StartGame);
}

/** 走路：payload 就一个字节方向
 *  MirDirection: Up=0, UpRight=1, Right=2, DownRight=3,
 *                Down=4, DownLeft=5, Left=6, UpLeft=7
 */
export function buildWalk(direction) {
  return new Writer().u8(direction).build(ClientPacketIds.Walk);
}

/**
 * 心跳包。
 *
 * Crystal 的 KeepAlive 结构是 int64 Time（8 字节时间戳），
 * 只发 [长度4, 包ID2] 而没有时间戳，服务端解析时会抛异常
 * → UpdateIPBlock(IP, 24小时)，整个 IP 被封一天。之前踩过这个坑。
 *
 * 服务端 20 秒收不到数据就判超时下线，所以 10 秒发一次即可。
 */
export function buildKeepAlive() {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(Date.now()), true);
  return new Writer()._raw(b).build(ClientPacketIds.KeepAlive);
}

export function buildTurn(direction) {
  return new Writer().u8(direction).build(ClientPacketIds.Turn);
}

export function buildRun(direction) {
  return new Writer().u8(direction).build(ClientPacketIds.Run);
}
