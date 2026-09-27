import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { RepositoryOwner } from '$lib/repositories/owner-options';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) => {
  const result = await routeLoad(apiWith<{ repositoryOwners: RepositoryOwner[] }>(fetch, '/organizations'));
  return { organizations: result.repositoryOwners.filter((organization) => organization.role !== 'member') };
}) satisfies PageLoad;
