import type { PullRequestDetail } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  const path = `/repositories/${params.owner}/${params.repo}/pulls/${params.number}`;
  const detail = await routeLoad(apiWith<{ pullRequest: PullRequestDetail }>(fetch, path));
  return { pull: detail.pullRequest };
}) satisfies PageLoad;
