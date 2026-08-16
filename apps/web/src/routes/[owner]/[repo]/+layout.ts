import type { RepositorySummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, params }) => {
  const result = await apiWith<{ repository: RepositorySummary & { cloneUrl: string } }>(fetch, `/repositories/${params.owner}/${params.repo}`);
  return { repository: result.repository };
};
