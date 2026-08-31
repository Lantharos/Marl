import type { ApiError } from '@marl/contracts';
import { requestElevation } from '$lib/auth/elevation';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class MarlApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return apiRequest(fetch, path, init, true);
}

export async function apiWith<T>(fetcher: Fetcher, path: string, init: RequestInit = {}): Promise<T> {
  return apiRequest(fetcher, path, init, false);
}

async function apiRequest<T>(fetcher: Fetcher, path: string, init: RequestInit, allowElevation: boolean): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetcher(`/api/v1${path}`, { ...init, headers });
  if (!response.ok) {
    const value = await response.json().catch(() => null) as ApiError | null;
    if (allowElevation && response.status === 403 && value?.error.code === 'identity_confirmation_required') {
      const confirmed = await requestElevation(value.error.message);
      if (!confirmed) throw new MarlApiError(0, 'request_cancelled', '');
      return apiRequest(fetcher, path, init, false);
    }
    throw new MarlApiError(response.status, value?.error.code ?? 'request_failed', value?.error.message ?? `Marl API request failed (${response.status}).`);
  }
  if (response.status === 204 || response.status === 205) return undefined as T;
  const body = await response.text();
  if (!body.trim()) return undefined as T;
  return JSON.parse(body) as T;
}

export async function apiText(path: string): Promise<string> {
  return apiTextWith(fetch, path);
}

export async function apiTextWith(fetcher: Fetcher, path: string): Promise<string> {
  const response = await fetcher(`/api/v1${path}`, { headers: { accept: 'text/plain, application/octet-stream' } });
  if (!response.ok) throw new MarlApiError(response.status, 'request_failed', `Marl API request failed (${response.status}).`);
  return response.text();
}

export async function apiTextCursor(path: string, after = -1): Promise<{ text: string; cursor: number; more: boolean }> {
  return apiTextCursorWith(fetch, path, after);
}

export async function apiTextCursorAll(path: string, after = -1): Promise<{ text: string; cursor: number }> {
  return apiTextCursorAllWith(fetch, path, after);
}

export async function apiTextCursorWith(fetcher: Fetcher, path: string, after = -1): Promise<{ text: string; cursor: number; more: boolean }> {
  const response = await fetcher(`/api/v1${path}?after=${after}`, { headers: { accept: 'text/plain' } });
  if (!response.ok) throw new MarlApiError(response.status, 'request_failed', `Marl API request failed (${response.status}).`);
  return { text: await response.text(), cursor: Number(response.headers.get('x-marl-log-cursor') ?? after), more: response.headers.get('x-marl-log-more') === 'true' };
}

export async function apiTextCursorAllWith(fetcher: Fetcher, path: string, after = -1): Promise<{ text: string; cursor: number }> {
  const parts: string[] = [];
  let cursor = after;
  while (true) {
    const next = await apiTextCursorWith(fetcher, path, cursor);
    if (!Number.isSafeInteger(next.cursor) || next.cursor < cursor || (next.more && next.cursor === cursor)) {
      throw new MarlApiError(502, 'invalid_log_cursor', 'Marl API returned an invalid log cursor.');
    }
    parts.push(next.text);
    cursor = next.cursor;
    if (!next.more) return { text: parts.join(''), cursor };
  }
}
