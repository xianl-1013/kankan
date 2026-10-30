# -*- coding: utf-8 -*-
"""验证 Crystal 服务端协议能否被外部程序解析（H5 客户端可行性验证）。

协议：<uint16 长度><int16 包ID><数据>
字符串：<7bit长度><UTF8>
"""
import socket, struct, hashlib, sys, os, time

sys.stdout.reconfigure(encoding='utf-8')

HOST, PORT = '127.0.0.1', 7000
CLIENT_EXE = r'C:\Users\sjy\mir2-test\Crystal\Build\Client\Release\Client.exe'

# ClientPacketIds (Enums.cs:1717)
C_VERSION, C_LOGIN = 0, 5
# ServerPacketIds (Enums.cs:1434)
S_NAMES = {0: 'Connected', 1: 'ClientVersion', 2: 'Disconnect', 3: 'KeepAlive',
           4: 'NewAccount', 5: 'ChangePassword', 6: 'ChangePasswordBanned',
           7: 'Login', 8: 'LoginBanned', 9: 'LoginSuccess', 10: 'NewCharacter',
           11: 'NewCharacterSuccess', 12: 'DeleteCharacter', 13: 'DeleteCharacterSuccess',
           14: 'StartGame', 15: 'StartGameBanned', 16: 'StartGameDelay'}


def wstr(s):
    b = s.encode('utf-8')
    assert len(b) < 128
    return bytes([len(b)]) + b


def pkt(pid, payload=b''):
    return struct.pack('<HH', 4 + len(payload), pid) + payload


def recv_pkt(sock, timeout=5):
    sock.settimeout(timeout)
    hdr = b''
    while len(hdr) < 4:
        chunk = sock.recv(4 - len(hdr))
        if not chunk:
            return None, None
        hdr += chunk
    length, pid = struct.unpack('<Hh', hdr)
    body = b''
    while len(body) < length - 4:
        chunk = sock.recv(length - 4 - len(body))
        if not chunk:
            break
        body += chunk
    return pid, body


def main():
    md5 = hashlib.md5(open(CLIENT_EXE, 'rb').read()).hexdigest()
    print(f'客户端 MD5: {md5}')

    s = socket.create_connection((HOST, PORT), timeout=5)
    print(f'已连接 {HOST}:{PORT}')

    pid, body = recv_pkt(s)
    print(f'[收] 包ID={pid} ({S_NAMES.get(pid, "?")}) 数据={body[:32].hex()}')

    # 发 ClientVersion
    digest = bytes.fromhex(md5)
    payload = struct.pack('<i', len(digest)) + digest
    s.sendall(pkt(C_VERSION, payload))
    print(f'[发] ClientVersion (id={C_VERSION}) hash={md5[:16]}...')

    pid, body = recv_pkt(s)
    print(f'[收] 包ID={pid} ({S_NAMES.get(pid, "?")}) 数据={body[:32].hex()}')

    if pid == 2:  # Disconnect
        print('!! 版本校验失败，服务端断开')
        return 1

    # 发 Login
    s.sendall(pkt(C_LOGIN, wstr('test123') + wstr('177587')))
    print(f'[发] Login (id={C_LOGIN}) account=test123')

    pid, body = recv_pkt(s)
    if pid is None:
        print('!! 服务端无响应')
        return 1
    print(f'[收] 包ID={pid} ({S_NAMES.get(pid, "?")}) 长度={len(body)}')

    if pid == 9:  # LoginSuccess
        if len(body) >= 4:
            cnt = struct.unpack('<i', body[:4])[0]
            print(f'✓✓ 登录成功！角色数={cnt}')
            for i in range(cnt):
                print(f'   角色 {i}: {body[4 + i * 40:4 + i * 40 + 40].hex()[:80]}')
            print('\n结论：Crystal 协议可被外部程序完整解析 —— **方案 A 技术上可行**')
            return 0
    print(f'完整响应: {body[:120].hex()}')
    return 0


if __name__ == '__main__':
    sys.exit(main())


def enter_game(sock, char_index=1):
    """发 StartGame 并收集服务端返回的所有包。"""
    print(f'\n[发] StartGame (id=6) CharacterIndex={char_index}')
    sock.sendall(pkt(6, struct.pack('<i', char_index)))
    got = []
    deadline = time.time() + 12
    while time.time() < deadline:
        try:
            pid, body = recv_pkt(sock, timeout=3)
        except socket.timeout:
            break
        if pid is None:
            break
        name = S_NAMES.get(pid, f'#{pid}')
        got.append((pid, name, len(body)))
        print(f'[收] 包ID={pid} ({name}) 长度={len(body)} 前32字节={body[:32].hex()}')
        if len(got) >= 12:
            break
    return got


if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1] == 'enter':
    md5 = hashlib.md5(open(CLIENT_EXE, 'rb').read()).hexdigest()
    s = socket.create_connection((HOST, PORT), timeout=5)
    recv_pkt(s)
    s.sendall(pkt(C_VERSION, struct.pack('<i', 16) + bytes.fromhex(md5)))
    recv_pkt(s)
    s.sendall(pkt(C_LOGIN, wstr('test123') + wstr('177587')))
    pid, body = recv_pkt(s)
    print(f'登录结果包={pid} ({S_NAMES.get(pid)})')
    if pid != 9:
        sys.exit(1)
    enter_game(s, int(sys.argv[2]) if len(sys.argv) > 2 else 1)
    sys.exit(0)
