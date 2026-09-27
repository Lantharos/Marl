import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { CommitSummary } from '$lib/repositories/browser/types';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => ({
  history: await routeLoad(
    apiWith<{ commits: CommitSummary[]; total: number; nextCursor: string | null }>(
      fetch,
      `/repositories/${params.owner}/${params.repo}/commits?revision=${encodeURIComponent(params.revision)}&limit=50`
    )
  )
})) satisfies PageLoad;
