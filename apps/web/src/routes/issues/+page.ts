import type { IssueSummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const state = ['open', 'closed', 'all'].includes(url.searchParams.get('state') ?? '') ? url.searchParams.get('state')! : 'open';
  const query = url.searchParams.get('q') ?? '';
  const search = new URLSearchParams({ limit: '40', state });
  if (query) search.set('q', query);
  const result = await routeLoad(apiWith<{ issues: IssueSummary[]; nextCursor: string | null }>(fetch, `/issues?${search}`));
  return { ...result, state, query };
};
