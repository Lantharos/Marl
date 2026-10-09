import type { RepositoryPermissions, RepositorySummary } from '@marl/contracts';
import { redirect } from '@sveltejs/kit';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { LayoutLoad } from './$types';

export const load = (async ({ fetch, params, url, untrack }) => {
  const result = await routeLoad(
    apiWith<{
      repository: RepositorySummary & {
        defaultBranch: string;
        cloneUrl: string;
        sshCloneUrl: string;
        permissions: RepositoryPermissions;
      };
    }>(fetch, `/repositories/${params.owner}/${params.repo}`)
  );
  if (params.owner !== result.repository.owner || params.repo !== result.repository.name) {
    const { pathname, search } = untrack(() => ({ pathname: url.pathname, search: url.search }));
    const suffix = pathname.match(/^\/[^/]+\/[^/]+(.*)$/)?.[1] ?? '';
    redirect(
      308,
      `/${encodeURIComponent(result.repository.owner)}/${encodeURIComponent(result.repository.name)}${suffix}${search}`
    );
  }
  return { repository: result.repository };
}) satisfies LayoutLoad;
