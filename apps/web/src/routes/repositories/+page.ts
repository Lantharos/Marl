import type { RepositorySummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const visibility = ['all', 'public', 'private', 'archived'].includes(url.searchParams.get('visibility') ?? '') ? url.searchParams.get('visibility')! : 'all';
  const query = url.searchParams.get('q') ?? '';
  const result = await routeLoad(apiWith<{ repositories: RepositorySummary[]; nextCursor: string | null }>(fetch, `/repositories?limit=30&visibility=${visibility}&q=${encodeURIComponent(query)}`));
  return { ...result, visibility, query };
};
