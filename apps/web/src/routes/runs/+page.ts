import type { RunSummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const state = ['all', 'active', 'success', 'failure', 'canceled'].includes(url.searchParams.get('state') ?? '') ? url.searchParams.get('state')! : 'all';
  const query = url.searchParams.get('q') ?? '';
  const result = await routeLoad(apiWith<{ runs: RunSummary[]; nextCursor: string | null }>(fetch, `/runs?limit=30&state=${state}&q=${encodeURIComponent(query)}`));
  return { ...result, state, query };
};
