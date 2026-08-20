import type { RepositorySummary } from '@marl/contracts';
import { redirect } from '@sveltejs/kit';
import { apiWith } from '$lib/api';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, url }) => {
  const isAuthRoute = ['/sign-in', '/sign-up', '/two-factor', '/forgot-password', '/reset-password'].includes(url.pathname) || url.pathname.startsWith('/invitations/');
  const publicHandle = url.pathname.match(/^\/([^/]+)\/?$/)?.[1];
  const privateRoots = new Set(['forgot-password', 'organizations', 'pulls', 'repositories', 'reset-password', 'runners', 'runs', 'settings', 'sign-in', 'sign-up', 'two-factor']);
  const isPublicProfile = Boolean(publicHandle && !privateRoots.has(publicHandle));
  let shellUser = null;
  try {
    shellUser = (await apiWith<{ user: { id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null } }>(fetch, '/session')).user;
  } catch {
    if (!isAuthRoute && !isPublicProfile) redirect(303, `/sign-in?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (isAuthRoute || !shellUser) return { shellUser: null, shellRepositories: [] as RepositorySummary[], shellOrganizations: [], shellRepositoriesUnavailable: false };
  const [repositoryResult, organizationResult] = await Promise.allSettled([
    apiWith<{ repositories: RepositorySummary[] }>(fetch, '/repositories'),
    apiWith<{ organizations: Array<{ slug: string; name: string; avatarUrl: string | null; role: string }> }>(fetch, '/organizations')
  ]);
  return {
    shellUser,
    shellRepositories: repositoryResult.status === 'fulfilled' ? repositoryResult.value.repositories : [],
    shellOrganizations: organizationResult.status === 'fulfilled' ? organizationResult.value.organizations : [],
    shellRepositoriesUnavailable: repositoryResult.status === 'rejected'
  };
};
