import type { RepositorySummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const [settings, branches] = await Promise.all([
    routeLoad(apiWith<{ repository: RepositorySummary & { role: 'owner' | 'member' }; organizations: Array<{ slug: string; name: string }> }>(fetch, `/repositories/${params.owner}/${params.repo}/settings`)),
    routeLoad(apiWith<{ defaultBranch: string; branches: Array<{ name: string }> }>(fetch, `/repositories/${params.owner}/${params.repo}/branches`))
  ]);
  return { ...settings, branches: branches.branches };
};
