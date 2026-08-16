import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branch = { name: string; commitId: string; title: string; updatedAt: string };

export const load: PageLoad = async ({ fetch, params }) => {
  const result = await routeLoad(apiWith<{ defaultBranch: string; branches: Branch[] }>(fetch, `/repositories/${params.owner}/${params.repo}/branches`));
  return { branches: result.branches.map((branch) => ({ name: branch.name, commit: branch.commitId.slice(0, 7), title: branch.title, updatedAt: branch.updatedAt, isDefault: branch.name === result.defaultBranch, ahead: 0, behind: 0 })) };
};
