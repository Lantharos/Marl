import { apiWith, MarlApiError } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branches = { defaultBranch: string; branches: Array<{ name: string; commitId: string; title: string; updatedAt: string }> };
type Tree = { commit: { id: string; shortId: string; title: string; author: string; authorHandle?: string | null; authorDisplayName?: string | null; authorAvatarUrl?: string | null; authoredAt: string; signatureStatus: string }; entries: Array<{ path: string; name: string; kind: 'blob' | 'tree'; byteSize?: number; message?: string; updatedAt?: string }> };

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const repository = (await parent()).repository;
  const revision = repository.defaultBranch ?? 'main';
  const [branches, treeResult] = await Promise.all([
    routeLoad(apiWith<Branches>(fetch, `/repositories/${params.owner}/${params.repo}/branches`)),
    apiWith<Tree>(fetch, `/repositories/${params.owner}/${params.repo}/tree?revision=${encodeURIComponent(revision)}`)
      .then((tree) => ({ tree }))
      .catch((cause: unknown) => ({ cause }))
  ]);
  if ('cause' in treeResult && treeResult.cause instanceof MarlApiError && treeResult.cause.code === 'revision_not_found' && branches.branches.length === 0) return { ...branches, tree: null };
  const tree = 'tree' in treeResult ? treeResult.tree : await routeLoad<Tree>(Promise.reject(treeResult.cause));
  return { ...branches, tree };
};
