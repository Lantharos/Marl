import type { PullRequestSummary, RunnerSummary, RunSummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent }) => {
  const [layout, dashboard] = await Promise.all([parent(), apiWith<{ pulls: PullRequestSummary[]; runs: RunSummary[]; runners: RunnerSummary[] }>(fetch, '/dashboard').catch(() => null)]);
  return {
    pulls: dashboard?.pulls ?? [],
    repositories: layout.shellRepositories,
    runs: dashboard?.runs ?? [],
    runners: dashboard?.runners ?? [],
    unavailable: layout.shellRepositoriesUnavailable || !dashboard
  };
};
