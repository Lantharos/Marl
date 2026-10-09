import type { Handle, HandleFetch } from '@sveltejs/kit/hooks';
import { env } from 'cloudflare:workers';
import { building, dev } from '$app/env';
import { themeCookie } from '#lib/theme.js';

const localApi = 'http://127.0.0.1:42618';
const sessionCookie = /(?:^|;\s*)(?:__Secure-)?marl\.session_token=/;
const viewerRoutes = new Set(['/api/v1/session', '/api/v1/shell', '/api/v1/dashboard']);

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

function apiRequest(target: string, request: Request, cookie: string | null) {
  const forwarded = new Request(target, request);
  if (cookie) forwarded.headers.set('cookie', cookie);
  return forwarded;
}

function signedOut() {
  return Response.json(
    { error: { code: 'authentication_required', message: 'Sign in to use the Marl API.' } },
    { status: 401 }
  );
}

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  const url = new URL(request.url);
  if (url.origin !== event.url.origin || !url.pathname.startsWith('/api/')) return fetch(request);
  const cookie = event.request.headers.get('cookie');
  if (!building && viewerRoutes.has(url.pathname) && !sessionCookie.test(cookie ?? '')) return signedOut();
  if (dev) return fetch(apiRequest(`${localApi}${url.pathname}${url.search}`, request, cookie));
  return env.MARL_API.fetch(apiRequest(`http://marl-api.internal${url.pathname}${url.search}`, request, cookie));
};
