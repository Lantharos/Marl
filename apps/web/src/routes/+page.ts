import type { PullRequestSummary, RunnerSummary, RunSummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent }) => {
  const [layout, results] = await Promise.all([parent(), Promise.allSettled([
    apiWith<{ pullRequests: PullRequestSummary[] }>(fetch, '/pulls'),
    apiWith<{ runs: RunSummary[] }>(fetch, '/runs'),
    apiWith<{ runners: RunnerSummary[] }>(fetch, '/runners')
  ])]);
  return {
    pulls: results[0].status === 'fulfilled' ? results[0].value.pullRequests : [],
    repositories: layout.shellRepositories,
    runs: results[1].status === 'fulfilled' ? results[1].value.runs : [],
    runners: results[2].status === 'fulfilled' ? results[2].value.runners : [],
    unavailable: layout.shellRepositoriesUnavailable || results.some((result) => result.status === 'rejected')
  };
};
