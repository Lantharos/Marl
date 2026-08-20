import type { PullRequestSummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const state = ['open', 'merged', 'closed'].includes(url.searchParams.get('state') ?? '') ? url.searchParams.get('state')! : 'open';
  const query = url.searchParams.get('q') ?? '';
  const labels = url.searchParams.getAll('label');
  const search = new URLSearchParams({ limit: '30', state });
  if (query) search.set('q', query);
  for (const label of labels) search.append('label', label);
  const result = await routeLoad(apiWith<{ pullRequests: PullRequestSummary[]; nextCursor: string | null; availableLabels: Array<{ name: string; color: string; description: string }> }>(fetch, `/repositories/${params.owner}/${params.repo}/pulls?${search}`));
  return { ...result, state, query, labels };
};
