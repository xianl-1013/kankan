/**
 * WebSocket 连接层：连本地桥接服务，收发二进制包
 */
import { parsePacket } from './protocol.js';

export class GameSocket extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };
      this.ws.onerror = (e) => reject(e);
      this.ws.onclose = () => {
        this.connected = false;
        this.dispatchEvent(new CustomEvent('closed'));
      };
      this.ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data);
            this.dispatchEvent(new CustomEvent('bridge', { detail: msg }));
          } catch { /* 忽略 */ }
          return;
        }
        const pkt = parsePacket(ev.data);
        if (pkt) this.dispatchEvent(new CustomEvent('packet', { detail: pkt }));
      };
    });
  }

  send(bytes) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(bytes);
  }

  onPacket(handler) {
    this.addEventListener('packet', (e) => handler(e.detail));
  }
}
