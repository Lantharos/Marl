import { dev } from '$app/environment';
import type { Handle, HandleFetch } from '@sveltejs/kit';

const localApi = 'http://127.0.0.1:42618';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  response.headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-permitted-cross-domain-policies', 'none');
  if (!dev) response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  return response;
};

export const handleFetch: HandleFetch = ({ event, request, fetch }) => {
  const url = new URL(request.url);
  if (dev && url.pathname.startsWith('/api/')) {
    return fetch(new Request(`${localApi}${url.pathname}${url.search}`, request));
  }
  if (url.pathname.startsWith('/api/')) {
    const api = event.platform?.env.MARL_API;
    if (!api) throw new Error('The API service binding is unavailable.');
    return api.fetch(new Request(`http://marl-api.internal${url.pathname}${url.search}`, request));
  }
  return fetch(request);
};
