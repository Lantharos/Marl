import type { RequestHandler } from './$types';

const robots = `User-agent: *
Allow: /
Allow: /api/v1/avatars/
Allow: /api/v1/organization-avatars/
Allow: /api/v1/repository-icons/
Disallow: /api/

Sitemap: https://marl.sh/sitemap.xml
`;

export const GET: RequestHandler = () => new Response(robots, {
  headers: {
    'cache-control': 'public, max-age=86400',
    'content-type': 'text/plain; charset=utf-8'
  }
});
