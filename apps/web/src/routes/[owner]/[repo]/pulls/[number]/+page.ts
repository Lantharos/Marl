import type { PullRequestDetail } from '@sty/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const path = `/repositories/${params.owner}/${params.repo}/pulls/${params.number}`;
  const detail = await routeLoad(apiWith<{ pullRequest: PullRequestDetail }>(fetch, path));
  return { pull: detail.pullRequest };
};
