import type { RepositorySummary } from '@marl/contracts';
import { redirect } from '@sveltejs/kit';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params, url }) => {
  const visibility = ['all', 'active', 'archived'].includes(url.searchParams.get('visibility') ?? '') ? url.searchParams.get('visibility')! : 'all';
  const query = url.searchParams.get('q') ?? '';
  const result = await routeLoad(apiWith<{ owner: string; repositories: RepositorySummary[]; nextCursor: string | null }>(fetch, `/profiles/${encodeURIComponent(params.identity)}/repositories?limit=30&visibility=${visibility}&q=${encodeURIComponent(query)}`));
  if (result.owner !== params.identity) redirect(308, `/${encodeURIComponent(result.owner)}/-/repositories${url.search}`);
  return { ...result, visibility, query };
}) satisfies PageLoad;
