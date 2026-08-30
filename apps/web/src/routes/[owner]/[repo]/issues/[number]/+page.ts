import type { IssueDetail } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const result = await routeLoad(apiWith<{ issue: IssueDetail }>(fetch, `/repositories/${params.owner}/${params.repo}/issues/${params.number}`));
  return { issue: result.issue };
};
