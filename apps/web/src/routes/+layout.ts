import type { InboxItem, RepositorySummary, RunSummary } from '@marl/contracts';
import { error, redirect } from '@sveltejs/kit';
import { apiWith, MarlApiError } from '$lib/api';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, url }) => {
  const isAuthRoute = ['/sign-in', '/sign-up', '/two-factor', '/forgot-password', '/reset-password'].includes(url.pathname) || url.pathname.startsWith('/invitations/');
  const isHomeRoute = url.pathname === '/';
  const publicHandle = url.pathname.match(/^\/([^/]+)\/?$/)?.[1];
  const privateRoots = new Set(['forgot-password', 'inbox', 'invitations', 'issues', 'organizations', 'pulls', 'repositories', 'reset-password', 'runners', 'runs', 'settings', 'sign-in', 'sign-up', 'two-factor']);
  const isPublicProfile = Boolean(publicHandle && !privateRoots.has(publicHandle));
  const repositoryRoute = url.pathname.match(/^\/([^/]+)\/[^/]+(?:\/(.*))?$/);
  const repositorySection = (repositoryRoute?.[2] ?? '').replace(/\/+$/, '');
  const isPublicSource = !repositorySection
    || repositorySection === 'code'
    || repositorySection === 'branches'
    || /^(?:tree|blob)\/[^/]+(?:\/.*)?$/.test(repositorySection)
    || /^commits\/[^/]+$/.test(repositorySection)
    || /^commit\/[^/]+$/.test(repositorySection);
  const isPublicRepository = Boolean(repositoryRoute && !privateRoots.has(repositoryRoute[1]) && isPublicSource);
  type ShellUser = { id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null };
  type ShellOrganization = { slug: string; name: string; avatarUrl: string | null; kind: 'personal' | 'team'; role: string };
  type ShellData = { user: ShellUser; repositories: RepositorySummary[]; repositoryOwners: ShellOrganization[] };
  type DashboardData = { inbox: { items: InboxItem[]; counts: { inbox: number; unread: number; done: number } }; runs: RunSummary[] };
  let shellUser: ShellUser | null = null;
  let shellData: ShellData | null = null;
  let shellDashboard: DashboardData | null = null;
  try {
    if (isAuthRoute) shellUser = (await apiWith<{ user: ShellUser }>(fetch, '/session')).user;
    else if (isHomeRoute) {
      const home = await apiWith<ShellData & { dashboard: DashboardData | null }>(fetch, '/dashboard');
      shellData = home;
      shellUser = home.user;
      shellDashboard = home.dashboard;
    }
    else {
      shellData = await apiWith<ShellData>(fetch, '/shell');
      shellUser = shellData.user;
    }
  } catch (cause) {
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
