import type { IssueSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, url }) => {
  const state = ['open', 'closed', 'all'].includes(url.searchParams.get('state') ?? '')
    ? url.searchParams.get('state')!
    : 'open';
  const query = url.searchParams.get('q') ?? '';
  const view = url.searchParams.get('view') ?? 'all';
  const search = new URLSearchParams({ limit: '40', state });
  search.set('view', view);
  if (query) search.set('q', query);
  const result = await routeLoad(
    apiWith<{ issues: IssueSummary[]; nextCursor: string | null }>(fetch, `/issues?${search}`)
  );
  return { ...result, state, query, view };
}) satisfies PageLoad;
