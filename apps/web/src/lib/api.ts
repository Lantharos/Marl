import type { ApiError } from '@sty/contracts';

export class StyApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return apiWith(fetch, path, init);
}

export async function apiWith<T>(fetcher: typeof fetch, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetcher(`/api/v1${path}`, { ...init, headers });
  if (!response.ok) {
    const value = await response.json().catch(() => null) as ApiError | null;
    throw new StyApiError(response.status, value?.error.code ?? 'request_failed', value?.error.message ?? `Sty API request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export async function apiText(path: string): Promise<string> {
  return apiTextWith(fetch, path);
}

export async function apiTextWith(fetcher: typeof fetch, path: string): Promise<string> {
  const response = await fetcher(`/api/v1${path}`, { headers: { accept: 'text/plain, application/octet-stream' } });
  if (!response.ok) throw new StyApiError(response.status, 'request_failed', `Sty API request failed (${response.status}).`);
  return response.text();
}

export async function apiTextCursor(path: string, after = -1): Promise<{ text: string; cursor: number; more: boolean }> {
  return apiTextCursorWith(fetch, path, after);
}

export async function apiTextCursorWith(fetcher: typeof fetch, path: string, after = -1): Promise<{ text: string; cursor: number; more: boolean }> {
  const response = await fetcher(`/api/v1${path}?after=${after}`, { headers: { accept: 'text/plain' } });
  if (!response.ok) throw new StyApiError(response.status, 'request_failed', `Sty API request failed (${response.status}).`);
  return { text: await response.text(), cursor: Number(response.headers.get('x-sty-log-cursor') ?? after), more: response.headers.get('x-sty-log-more') === 'true' };
}
