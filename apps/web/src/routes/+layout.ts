import type { RepositorySummary } from '@marl/contracts';
import { redirect } from '@sveltejs/kit';
import { apiWith } from '$lib/api';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, url }) => {
  const isAuthRoute = ['/sign-in', '/sign-up', '/two-factor', '/forgot-password', '/reset-password'].includes(url.pathname) || url.pathname.startsWith('/invitations/');
  let shellUser = null;
  try {
    shellUser = (await apiWith<{ user: { id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null } }>(fetch, '/session')).user;
  } catch {
    if (!isAuthRoute) redirect(303, `/sign-in?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (isAuthRoute) return { shellUser: null, shellRepositories: [] as RepositorySummary[], shellRepositoriesUnavailable: false };
  try {
    const { repositories } = await apiWith<{ repositories: RepositorySummary[] }>(fetch, '/repositories');
    return { shellUser, shellRepositories: repositories, shellRepositoriesUnavailable: false };
  } catch {
    return { shellUser, shellRepositories: [] as RepositorySummary[], shellRepositoriesUnavailable: true };
  }
};
