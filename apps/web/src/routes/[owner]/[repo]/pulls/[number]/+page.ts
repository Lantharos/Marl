import type { PullRequestDetail, PullRequestDiff } from '@sty/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const path = `/repositories/${params.owner}/${params.repo}/pulls/${params.number}`;
  const [detail, diff] = await Promise.all([
    routeLoad(apiWith<{ pullRequest: PullRequestDetail }>(fetch, path)),
    routeLoad(apiWith<PullRequestDiff>(fetch, `${path}/diff`))
  ]);
  return { pull: detail.pullRequest, diff };
};
