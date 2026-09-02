import type { PublicIndex } from '@marl/contracts';
import { json } from './http';
import type { Env } from './platform';

const maximumSitemapUrls = 50_000;
const homepageUrls = 1;
const urlsPerRepository = 5;
const maximumRepositoryCandidates = Math.floor((maximumSitemapUrls - homepageUrls) / urlsPerRepository);

export async function getPublicIndex(env: Env) {
  const candidates = await env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name,repositories.updated_at AS updatedAt FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.visibility='public' AND repositories.deletion_scheduled_at IS NULL ORDER BY repositories.updated_at DESC LIMIT ?`).bind(maximumRepositoryCandidates).all<PublicIndex['repositories'][number]>();
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
  const response = json({ identities, repositories } satisfies PublicIndex);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}
