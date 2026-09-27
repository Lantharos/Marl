import type { PageLoad } from './$types';

export const load = (async ({ parent }) => {
  const layout = await parent();
  if (!layout.shellUser) return { view: 'landing' as const };
  const dashboard = layout.shellDashboard;
  return {
    view: 'dashboard' as const,
    inbox: dashboard?.inbox ?? { items: [], counts: { inbox: 0, unread: 0, done: 0 } },
    onboarding: dashboard?.onboarding ?? null,
    repositories: layout.shellRepositories,
    runs: dashboard?.runs ?? [],
    user: layout.shellUser,
    unavailable: layout.shellRepositoriesUnavailable || !dashboard
  };
}) satisfies PageLoad;
