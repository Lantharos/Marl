import { DurableObject } from 'cloudflare:workers';
import type { Env } from './platform';

export class RunRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method !== 'POST' || !request.body) return new Response(null, { status: 405 });
    const sequence = Number(request.headers.get('x-marl-log-sequence'));
    if (!Number.isSafeInteger(sequence) || sequence < 0) return new Response(null, { status: 422 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    const message = new Uint8Array(8 + bytes.byteLength);
    new DataView(message.buffer).setBigUint64(0, BigInt(sequence));
    message.set(bytes, 8);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
    return new Response(null, { status: 204 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping') socket.send('pong');
  }
}
