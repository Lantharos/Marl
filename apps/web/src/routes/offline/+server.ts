import { offlineDocument } from '$lib/server/offline-document';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = async () => new Response(await offlineDocument(), {
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=0, must-revalidate',
    'x-robots-tag': 'noindex, nofollow'
  }
});
