import { dev } from '$app/environment';
import type { HandleFetch } from '@sveltejs/kit';

const localApi = 'http://127.0.0.1:42618';

export const handleFetch: HandleFetch = ({ request, fetch }) => {
  const url = new URL(request.url);
  if (dev && url.pathname.startsWith('/api/')) {
    return fetch(new Request(`${localApi}${url.pathname}${url.search}`, request));
  }
  return fetch(request);
};
