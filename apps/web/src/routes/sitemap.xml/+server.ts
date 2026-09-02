import type { PublicIndex } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { isoTimestamp } from '$lib/time';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
  const index = await apiWith<PublicIndex>(fetch, '/public-index');
  const urls = [
    sitemapEntry('https://marl.sh/'),
    ...index.identities.map((identity) => sitemapEntry(`https://marl.sh/${encodeURIComponent(identity.handle)}`)),
    ...index.repositories.flatMap((repository) => {
      const root = `https://marl.sh/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
      return ['', '/code', '/releases', '/issues', '/pulls'].map((section) => sitemapEntry(`${root}${section}`, repository.updatedAt));
    })
  ];
  const document = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
  return new Response(document, {
    headers: {
      'cache-control': 'public, max-age=60, s-maxage=300',
      'content-type': 'application/xml; charset=utf-8'
    }
  });
};

function sitemapEntry(location: string, updatedAt?: string) {
  const lastModified = updatedAt ? isoTimestamp(updatedAt) : null;
  return `  <url><loc>${xml(location)}</loc>${lastModified ? `<lastmod>${lastModified}</lastmod>` : ''}</url>`;
}

function xml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
