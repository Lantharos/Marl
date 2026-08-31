import type { InboxItem, RunSummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent }) => {
  const [layout, dashboard] = await Promise.all([parent(), apiWith<{ inbox: { items: InboxItem[]; counts: { inbox: number; unread: number; done: number } }; runs: RunSummary[] }>(fetch, '/dashboard').catch(() => null)]);
  return {
    inbox: dashboard?.inbox ?? { items: [], counts: { inbox: 0, unread: 0, done: 0 } },
    repositories: layout.shellRepositories,
    runs: dashboard?.runs ?? [],
    user: layout.shellUser,
    unavailable: layout.shellRepositoriesUnavailable || !dashboard
  };
};
