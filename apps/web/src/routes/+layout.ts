import type { RepositorySummary } from '@marl/contracts';
import { error, redirect } from '@sveltejs/kit';
import { apiWith, MarlApiError } from '$lib/api';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, url }) => {
  const isAuthRoute = ['/sign-in', '/sign-up', '/two-factor', '/forgot-password', '/reset-password'].includes(url.pathname) || url.pathname.startsWith('/invitations/');
  const publicHandle = url.pathname.match(/^\/([^/]+)\/?$/)?.[1];
  const privateRoots = new Set(['forgot-password', 'organizations', 'pulls', 'repositories', 'reset-password', 'runners', 'runs', 'settings', 'sign-in', 'sign-up', 'two-factor']);
  const isPublicProfile = Boolean(publicHandle && !privateRoots.has(publicHandle));
  let shellUser = null;
  try {
    shellUser = (await apiWith<{ user: { id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null } }>(fetch, '/session')).user;
  } catch (cause) {
    if (!isAuthRoute && !isPublicProfile) {
      if (cause instanceof MarlApiError && cause.status === 401) redirect(303, `/sign-in?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
      error(503, 'Marl is temporarily unavailable.');
    }
  }
  if (isAuthRoute && shellUser) {
    const requested = url.searchParams.get('returnTo');
    redirect(303, requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/');
  }
  if (isAuthRoute || !shellUser) return { shellUser: null, shellRepositories: [] as RepositorySummary[], shellOrganizations: [], shellRepositoriesUnavailable: false };
  const [repositoryResult, organizationResult] = await Promise.allSettled([
    apiWith<{ repositories: RepositorySummary[] }>(fetch, '/repositories'),
    apiWith<{ organizations: Array<{ slug: string; name: string; avatarUrl: string | null; kind: 'personal' | 'team'; role: string }> }>(fetch, '/organizations')
  ]);
  return {
    shellUser,
    shellRepositories: repositoryResult.status === 'fulfilled' ? repositoryResult.value.repositories : [],
    shellOrganizations: organizationResult.status === 'fulfilled' ? organizationResult.value.organizations : [],
    shellRepositoriesUnavailable: repositoryResult.status === 'rejected'
  };
};
