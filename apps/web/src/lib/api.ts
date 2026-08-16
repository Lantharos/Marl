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
  const response = await fetch(`/api/v1${path}`, { headers: { accept: 'text/plain, application/octet-stream' } });
  if (!response.ok) throw new StyApiError(response.status, 'request_failed', `Sty API request failed (${response.status}).`);
  return response.text();
}
