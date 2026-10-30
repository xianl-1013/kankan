# -*- coding: utf-8 -*-
"""验证完整进游戏流程：Connect -> Version -> Login -> StartGame -> 收地图/角色数据。"""
import socket, struct, hashlib, sys, time

sys.stdout.reconfigure(encoding='utf-8')
HOST, PORT = '127.0.0.1', 7000
CLIENT_EXE = r'C:\Users\sjy\mir2-test\Crystal\Build\Client\Release\Client.exe'


def wstr(s):
    b = s.encode('utf-8')
    return bytes([len(b)]) + b


def pkt(pid, payload=b''):
    return struct.pack('<HH', 4 + len(payload), pid) + payload


def recv_pkt(sock, timeout=4):
    sock.settimeout(timeout)
    hdr = b''
    while len(hdr) < 4:
        c = sock.recv(4 - len(hdr))
        if not c:
            return None, None
        hdr += c
    length, pid = struct.unpack('<Hh', hdr)
    body = b''
    while len(body) < length - 4:
        c = sock.recv(length - 4 - len(body))
        if not c:
            break
        body += c
    return pid, body


def rd_str(buf, off):
    n = buf[off]
    return buf[off + 1:off + 1 + n].decode('utf-8', 'replace'), off + 1 + n


def main():
    char_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    md5 = hashlib.md5(open(CLIENT_EXE, 'rb').read()).hexdigest()

    s = socket.create_connection((HOST, PORT), timeout=5)
    recv_pkt(s)                                   # Connected
    s.sendall(pkt(0, struct.pack('<i', 16) + bytes.fromhex(md5)))   # ClientVersion
    recv_pkt(s)
    s.sendall(pkt(5, wstr('test123') + wstr('177587')))             # Login
    pid, body = recv_pkt(s)
    if pid != 9:
        print(f'登录失败 pid={pid}'); return 1

    cnt = struct.unpack('<i', body[:4])[0]
    off = 4
    chars = []
    for _ in range(cnt):
        idx = struct.unpack('<i', body[off:off + 4])[0]; off += 4
        name, off = rd_str(body, off)
        level = struct.unpack('<H', body[off:off + 2])[0]; off += 2
        cls, gender = body[off], body[off + 1]; off += 2
        off += 8
        chars.append((idx, name, level, cls, gender))
        print(f'角色: Index={idx} Name={name} Lv={level} Class={cls} Gender={gender}')

    print(f'\n[发] StartGame CharacterIndex={char_idx}')
    s.sendall(pkt(8, struct.pack("<i", char_idx)))

    print('[收] 服务端返回:')
    deadline = time.time() + 15
    n = 0
    while time.time() < deadline and n < 25:
        try:
            pid, body = recv_pkt(s, timeout=3)
        except socket.timeout:
            print('  (超时)')
            break
        if pid is None:
            print('  (连接关闭)')
            break
        n += 1
        print(f'  #{n} 包ID={pid:<4} 长度={len(body):<6} {body[:40].hex()}')
    print(f'\n共收到 {n} 个包')
    return 0


if __name__ == '__main__':
    sys.exit(main())
