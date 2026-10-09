import { LogBuffer } from './log-buffer.svelte';

type LogPage = { cursor: number; more: boolean; chunks: Array<{ text: string; time: number | null }> };

async function fetchPage(jobId: string, after: number): Promise<LogPage> {
  const response = await fetch(`/api/v1/jobs/${jobId}/logs?after=${after}`, { headers: { accept: 'text/plain' } });
  if (!response.ok) throw new Error(`Log request failed (${response.status}).`);
  const text = await response.text();
  const cursor = Number(response.headers.get('x-marl-log-cursor') ?? after);
  const more = response.headers.get('x-marl-log-more') === 'true';
  if (!Number.isSafeInteger(cursor) || cursor < after || (more && cursor === after))
    throw new Error('The log cursor is invalid.');
  const chunks: LogPage['chunks'] = [];
  let offset = 0;
  for (const entry of (response.headers.get('x-marl-log-times') ?? '').split(',').filter(Boolean)) {
    const [length, time] = entry.split('@').map(Number);
    chunks.push({ text: text.slice(offset, offset + length), time });
    offset += length;
  }
  if (offset < text.length) chunks.push({ text: text.slice(offset), time: null });
  return { cursor, more, chunks };
}

export class JobLog {
  readonly buffer = new LogBuffer();
  status = $state<'loading' | 'ready' | 'unavailable'>('loading');
  #cursor = -1;
  #pending = new Map<number, string>();
  #request: Promise<void> | null = null;
  #closed = false;

  constructor(readonly jobId: string) {}

  catchUp(): Promise<void> {
    this.#request ??= this.#load().finally(() => (this.#request = null));
    return this.#request;
  }

  async #load() {
    try {
      for (;;) {
        const page = await fetchPage(this.jobId, this.#cursor);
        if (this.#closed) return;
        for (const chunk of page.chunks) this.buffer.append(chunk.text, chunk.time);
        this.#cursor = page.cursor;
        for (const sequence of this.#pending.keys()) if (sequence <= this.#cursor) this.#pending.delete(sequence);
        this.#flush();
        if (!page.more) break;
      }
      this.status = 'ready';
    } catch {
      if (!this.#closed) this.status = this.buffer.count ? 'ready' : 'unavailable';
    }
  }

  #flush() {
    while (this.#pending.has(this.#cursor + 1)) {
      this.#cursor++;
      this.buffer.append(this.#pending.get(this.#cursor)!, Date.now());
      this.#pending.delete(this.#cursor);
    }
  }

  follow() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/api/v1/jobs/${this.jobId}/live`);
    const decoder = new TextDecoder();
    socket.binaryType = 'arraybuffer';
    socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 8) return;
      const sequence = Number(new DataView(event.data).getBigUint64(0));
      if (!Number.isSafeInteger(sequence) || sequence <= this.#cursor || this.#pending.has(sequence)) return;
      this.#pending.set(sequence, decoder.decode(event.data.slice(8)));
      this.#flush();
      if (this.#pending.size) void this.catchUp();
    };
    return () => socket.close();
  }

  close() {
    this.#closed = true;
  }
}
