export async function readBoundedBody(body: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<ArrayBuffer | null> {
  if (!body) return new ArrayBuffer(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maximumBytes - total) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      if (value.byteLength > 0) chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

type BodyRequest = { body: ReadableStream<Uint8Array> | null; headers: Headers };

export async function readBoundedRequestBody(request: BodyRequest, maximumBytes: number): Promise<ArrayBuffer | null> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maximumBytes) return null;
  }
  return readBoundedBody(request.body, maximumBytes);
}

export async function readBoundedJson<T>(request: BodyRequest, maximumBytes: number): Promise<T | null> {
  const bytes = await readBoundedRequestBody(request, maximumBytes);
  return parseJson<T>(bytes);
}

export async function readBoundedJsonBody<T>(body: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<T | null> {
  return parseJson<T>(await readBoundedBody(body, maximumBytes));
}

export async function readBoundedText(body: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<string | null> {
  const bytes = await readBoundedBody(body, maximumBytes);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function parseJson<T>(bytes: ArrayBuffer | null): T | null {
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch {
    return null;
  }
}
