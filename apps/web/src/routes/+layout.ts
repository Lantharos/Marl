import type { InboxItem, RepositorySummary, RunSummary } from '@marl/contracts';
import { error, redirect } from '@sveltejs/kit';
import { apiWith, MarlApiError } from '$lib/api';
import { isPublicRepositoryPath } from '$lib/repository-route';
import { cachedShell, clearShellCache, rememberShell, type ShellData, type ShellUser } from '$lib/shell-cache';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, url, depends }) => {
  depends('marl:shell');
  const isAuthRoute = ['/sign-in', '/sign-up', '/two-factor', '/forgot-password', '/reset-password'].includes(url.pathname) || url.pathname.startsWith('/invitations/');
  const isHomeRoute = url.pathname === '/';
  const publicHandle = url.pathname.match(/^\/([^/]+)(?:\/-\/repositories)?\/?$/)?.[1];
  const privateRoots = new Set(['forgot-password', 'inbox', 'invitations', 'issues', 'organizations', 'pulls', 'repositories', 'reset-password', 'runners', 'runs', 'settings', 'sign-in', 'sign-up', 'two-factor']);
  const isPublicProfile = Boolean(publicHandle && !privateRoots.has(publicHandle));
  const repositoryRoute = url.pathname.match(/^\/([^/]+)\/[^/]+/);
  const isPublicRepository = Boolean(repositoryRoute && !privateRoots.has(repositoryRoute[1]) && isPublicRepositoryPath(url.pathname));
  type DashboardData = { inbox: { items: InboxItem[]; counts: { inbox: number; unread: number; done: number } }; runs: RunSummary[] };
  let shellUser: ShellUser | null = null;
  let shellData: ShellData | null = null;
  let shellDashboard: DashboardData | null = null;
  try {
    if (isAuthRoute) {
      clearShellCache();
      shellUser = (await apiWith<{ user: ShellUser }>(fetch, '/session')).user;
    }
    else if (isHomeRoute) {
      const home = await apiWith<ShellData & { dashboard: DashboardData | null }>(fetch, '/dashboard');
      shellData = home;
      shellUser = home.user;
      shellDashboard = home.dashboard;
      rememberShell(home);
    }
    else {
      shellData = await cachedShell(async () => {
        try { return await apiWith<ShellData>(fetch, '/shell'); }
        catch (cause) {
          if (cause instanceof MarlApiError && cause.status === 401) return null;
          throw cause;
        }
      });
      if (!shellData) throw new MarlApiError(401, 'unauthorized', 'Sign in to continue.');
      shellUser = shellData.user;
    }
  } catch (cause) {
    if (cause instanceof MarlApiError && cause.status === 401) rememberShell(null);
    if (!isAuthRoute && !isPublicProfile && !isPublicRepository && !isHomeRoute) {
      if (cause instanceof MarlApiError && cause.status === 401) redirect(303, `/sign-in?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
      error(503, 'Marl is temporarily unavailable.');
    }
  }
  if (isAuthRoute && shellUser) {
    const requested = url.searchParams.get('returnTo');
    redirect(303, requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/');
  }
  if (isAuthRoute || !shellUser) return { shellUser: null, shellRepositories: [] as RepositorySummary[], shellOrganizations: [], shellRepositoriesUnavailable: false, shellDashboard: null };
  return {
    shellUser,
    shellRepositories: shellData?.repositories ?? [],
    shellOrganizations: shellData?.repositoryOwners ?? [],
    shellRepositoriesUnavailable: !shellData,
    shellDashboard
  };
};
