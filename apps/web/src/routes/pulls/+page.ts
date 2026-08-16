import type { PullRequestSummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => apiWith<{ pullRequests: PullRequestSummary[] }>(fetch, '/pulls');
