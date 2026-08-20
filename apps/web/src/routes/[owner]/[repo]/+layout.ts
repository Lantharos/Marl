import type { RepositorySummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, params }) => {
  const result = await routeLoad(apiWith<{ repository: RepositorySummary & { cloneUrl: string; sshCloneUrl: string | null } }>(fetch, `/repositories/${params.owner}/${params.repo}`));
  return { repository: result.repository };
};
