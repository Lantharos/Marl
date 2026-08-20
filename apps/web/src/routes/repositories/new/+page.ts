import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Organization = { slug: string; name: string; kind: 'personal' | 'team'; role: 'owner' | 'admin' | 'member' };

export const load: PageLoad = async ({ fetch }) => {
  const result = await routeLoad(apiWith<{ repositoryOwners: Organization[] }>(fetch, '/organizations'));
  return { organizations: result.repositoryOwners.filter((organization) => organization.role !== 'member') };
};
