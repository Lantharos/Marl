import type { PullRealtimeUpdate } from '@sty/contracts';

interface PullLiveOptions {
  path: string;
  onUpdate(update: PullRealtimeUpdate): void;
  catchUp(): Promise<void>;
}

export function connectPullLive({ path, onUpdate, catchUp }: PullLiveOptions) {
  let stopped = false;
  let socket: WebSocket | null = null;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let delay = 500;

  const connect = () => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}${path}`);
    socket.onopen = () => {
      delay = 500;
      void catchUp();
    };
    socket.onmessage = (message) => {
      try {
        const value = JSON.parse(String(message.data)) as { type: string; update?: PullRealtimeUpdate };
        if (value.type === 'update' && value.update) onUpdate(value.update);
      } catch {}
    };
    socket.onclose = () => {
      if (stopped) return;
      reconnect = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 10_000);
    };
  };

  const catchUpWhenVisible = () => {
    if (document.visibilityState === 'visible') void catchUp();
  };

  connect();
  document.addEventListener('visibilitychange', catchUpWhenVisible);
  return () => {
    stopped = true;
    if (reconnect) clearTimeout(reconnect);
    socket?.close();
    document.removeEventListener('visibilitychange', catchUpWhenVisible);
  };
}
