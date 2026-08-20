import type { PullRequestSummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const state = ['open', 'merged', 'closed'].includes(url.searchParams.get('state') ?? '') ? url.searchParams.get('state')! : 'open';
  const query = url.searchParams.get('q') ?? '';
  const result = await routeLoad(apiWith<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(fetch, `/pulls?limit=30&state=${state}&q=${encodeURIComponent(query)}`));
  return { ...result, state, query };
};
