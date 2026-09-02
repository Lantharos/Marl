import type { InboxItem, RunSummary } from '@marl/contracts';
import type { PageLoad } from './$types';

type Dashboard = {
  inbox: { items: InboxItem[]; counts: { inbox: number; unread: number; done: number } };
  runs: RunSummary[];
};

export const load: PageLoad = async ({ parent }) => {
  const layout = await parent();
  if (!layout.shellUser) return { view: 'landing' as const };
  const dashboard = layout.shellDashboard as Dashboard | null;
  return {
    view: 'dashboard' as const,
    inbox: dashboard?.inbox ?? { items: [], counts: { inbox: 0, unread: 0, done: 0 } },
    repositories: layout.shellRepositories,
    runs: dashboard?.runs ?? [],
    user: layout.shellUser,
    unavailable: layout.shellRepositoriesUnavailable || !dashboard
  };
};
