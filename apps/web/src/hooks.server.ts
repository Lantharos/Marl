import { dev } from '$app/environment';
import type { Handle, HandleFetch } from '@sveltejs/kit';
import { themeCookie } from '$lib/theme';

const localApi = 'http://127.0.0.1:42618';

export const handle: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get(themeCookie);
  const themeAttribute = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : '';
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%marl.theme%', themeAttribute)
  });
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  response.headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-permitted-cross-domain-policies', 'none');
  if (!dev) response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  return response;
};

function apiRequest(event: Parameters<HandleFetch>[0]['event'], target: string, request: Request) {
  const forwarded = new Request(target, request);
  const cookie = event.request.headers.get('cookie');
  if (cookie) forwarded.headers.set('cookie', cookie);
  return forwarded;
}

export const handleFetch: HandleFetch = ({ event, request, fetch }) => {
  const url = new URL(request.url);
  if (url.origin !== event.url.origin || !url.pathname.startsWith('/api/')) return fetch(request);
  if (dev) return fetch(apiRequest(event, `${localApi}${url.pathname}${url.search}`, request));
  const api = event.platform?.env.MARL_API;
  if (!api) throw new Error('The API service binding is unavailable.');
  return api.fetch(apiRequest(event, `http://marl-api.internal${url.pathname}${url.search}`, request));
};
