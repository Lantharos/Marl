import { apiTextWith, apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branches = { defaultBranch: string; branches: Array<{ name: string; commitId: string; title: string; updatedAt: string }> };
type Tree = { commit: { id: string; shortId: string; title: string; author: string; authoredAt: string; signatureStatus: string }; entries: Array<{ path: string; name: string; kind: 'blob' | 'tree'; byteSize?: number }> };

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const repository = (await parent()).repository;
  const revision = repository.defaultBranch ?? 'main';
  const branchesPromise = routeLoad(apiWith<Branches>(fetch, `/repositories/${params.owner}/${params.repo}/branches`));
  const treePromise = routeLoad(apiWith<Tree>(fetch, `/repositories/${params.owner}/${params.repo}/tree?revision=${encodeURIComponent(revision)}`));
  const readmePromise = apiTextWith(fetch, `/repositories/${params.owner}/${params.repo}/blob/${encodeURIComponent(revision)}/README.md`).catch(() => '');
  const [branches, tree, readme] = await Promise.all([branchesPromise, treePromise, readmePromise]);
  return { ...branches, tree, readme };
};
