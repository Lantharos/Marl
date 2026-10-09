import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { RepositoryOwner } from '#lib/repositories/owner-options.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) => {
  const result = await routeLoad(apiWith<{ repositoryOwners: RepositoryOwner[] }>(fetch, '/organizations'));
  return { organizations: result.repositoryOwners.filter((organization) => organization.role !== 'member') };
}) satisfies PageLoad;
