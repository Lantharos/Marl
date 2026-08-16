import type { RepositorySummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch }) => {
  try {
    const { repositories } = await apiWith<{ repositories: RepositorySummary[] }>(fetch, '/repositories');
    return { shellRepositories: repositories, shellRepositoriesUnavailable: false };
  } catch {
    return { shellRepositories: [] as RepositorySummary[], shellRepositoriesUnavailable: true };
  }
};
