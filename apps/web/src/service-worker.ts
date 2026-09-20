/// <reference lib="webworker" />

import { version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const cachePrefix = 'marl-offline-';
const cacheName = `${cachePrefix}${version}`;
const offlinePath = '/offline';
const resources = new Set([
  offlinePath,
  '/favicon.svg',
  ...['Regular', 'Medium', 'Semibold', 'Bold'].map(weight => `/fonts/open-runde/OpenRunde-${weight}-latin.woff2`),
  ...['dark', 'light'].flatMap(theme => [
    `/errors/gone-${theme}.webp`,
    `/errors/gone-${theme}-small.webp`
  ])
]);

worker.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...resources].map(path => new Request(path, { cache: 'reload', credentials: 'omit' })));
    await worker.skipWaiting();
  })());
});

worker.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await worker.registration.navigationPreload?.enable();
    await worker.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName).map(key => caches.delete(key)));
  })());
});

async function cachedResource(request: Request) {
  return await caches.match(request.url, { cacheName }) ?? fetch(request);
}

async function navigate(event: FetchEvent) {
  try {
    const response = await event.preloadResponse ?? await fetch(event.request);
    if (response.type === 'error') throw new TypeError('Navigation request failed');
    return response;
  } catch (cause) {
    const offline = await caches.match(offlinePath, { cacheName });
    if (!offline) throw cause;
    return new Response(offline.body, { status: 503, statusText: 'Service Unavailable', headers: offline.headers });
  }
}

worker.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== worker.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(navigate(event));
  } else if (!url.search && resources.has(url.pathname)) {
    event.respondWith(cachedResource(event.request));
  }
});
