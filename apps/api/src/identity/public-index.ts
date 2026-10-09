import type { PublicIndex } from '@marl/contracts';
import type { Env } from '../core/platform';

const maximumSitemapUrls = 50_000;
const homepageUrls = 1;
const urlsPerRepository = 5;
const maximumRepositoryCandidates = Math.floor((maximumSitemapUrls - homepageUrls) / urlsPerRepository);

export async function getPublicIndex(env: Env, execution: ExecutionContext) {
  const cacheKey = new Request('https://public-index.marl.internal/');
  const cached = await caches.default.match(cacheKey);
  if (cached) return publicIndexResponse(await cached.text());
  const candidates = await env.DB.prepare(
    `SELECT organizations.slug AS owner,repositories.name,repositories.updated_at AS updatedAt FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.visibility='public' AND repositories.deletion_scheduled_at IS NULL ORDER BY repositories.updated_at DESC LIMIT ?`
  )
    .bind(maximumRepositoryCandidates)
    .all<PublicIndex['repositories'][number]>();
  const repositories: PublicIndex['repositories'] = [];
  const handles = new Set<string>();
  for (const repository of candidates.results) {
    const newIdentityUrls = handles.has(repository.owner) ? 0 : 1;
    const nextUrlCount = homepageUrls + (repositories.length + 1) * urlsPerRepository + handles.size + newIdentityUrls;
    if (nextUrlCount > maximumSitemapUrls) break;
    repositories.push(repository);
    handles.add(repository.owner);
  }
  const identities = [...handles].map((handle) => ({ handle }));
  const body = JSON.stringify({ identities, repositories } satisfies PublicIndex);
  execution.waitUntil(
    caches.default.put(cacheKey, new Response(body, { headers: { 'cache-control': 'public, max-age=300' } }))
  );
  return publicIndexResponse(body);
}

function publicIndexResponse(body: string) {
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}
