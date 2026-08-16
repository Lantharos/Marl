import { DurableObject } from 'cloudflare:workers';
import type { Env } from './platform';
import { readJson } from './http';
import { pullRealtimeUpdateBody } from './request-schemas';

export class PullRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const update = await readJson(request, pullRealtimeUpdateBody);
    if (!update) return Response.json({ error: 'invalid_update' }, { status: 422 });
    const message = JSON.stringify({ type: 'update', update });
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
    return new Response(null, { status: 204 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping') socket.send('pong');
  }
}
