import type { RepositorySummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  const [settings, branches] = await Promise.all([
    routeLoad(
      apiWith<{
        repository: RepositorySummary & { role: 'owner' | 'member' };
        organizations: Array<{ slug: string; name: string }>;
      }>(fetch, `/repositories/${params.owner}/${params.repo}/settings`)
    ),
    routeLoad(
      apiWith<{ defaultBranch: string; branches: Array<{ name: string }> }>(
        fetch,
        `/repositories/${params.owner}/${params.repo}/branches`
      )
    )
  ]);
  return { ...settings, branches: branches.branches };
}) satisfies PageLoad;
