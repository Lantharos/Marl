import type { AbuseReport } from '@marl/contracts';
import { error } from '@sveltejs/kit';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, parent, url }) => {
  const { shellUser } = await parent();
  if (!shellUser?.staff) error(404, 'Not found');
  const state = url.searchParams.get('state') === 'closed' ? 'closed' : 'open';
  const result = await routeLoad(apiWith<{ reports: AbuseReport[] }>(fetch, `/admin/reports?state=${state}`));
  return { state, reports: result.reports };
}) satisfies PageLoad;
