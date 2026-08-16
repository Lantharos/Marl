import type { PullRequestSummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) =>
  apiWith<{ pullRequests: PullRequestSummary[] }>(fetch, `/repositories/${params.owner}/${params.repo}/pulls`);
