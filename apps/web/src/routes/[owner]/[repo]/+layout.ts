import type { RepositoryPermissions, RepositorySummary } from '@marl/contracts';
import { redirect } from '@sveltejs/kit';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, params, url }) => {
  const result = await routeLoad(apiWith<{ repository: RepositorySummary & { cloneUrl: string; sshCloneUrl: string | null; permissions: RepositoryPermissions } }>(fetch, `/repositories/${params.owner}/${params.repo}`));
  if (params.owner !== result.repository.owner || params.repo !== result.repository.name) {
    const suffix = url.pathname.match(/^\/[^/]+\/[^/]+(.*)$/)?.[1] ?? '';
    redirect(308, `/${encodeURIComponent(result.repository.owner)}/${encodeURIComponent(result.repository.name)}${suffix}${url.search}`);
  }
  return { repository: result.repository };
};
