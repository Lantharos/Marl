import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branches = { defaultBranch: string; branches: Array<{ name: string; commitId: string; title: string; updatedAt: string }> };
type Tree = { commit: { id: string; shortId: string; title: string; author: string; authorAvatarUrl?: string | null; authoredAt: string; signatureStatus: string }; entries: Array<{ path: string; name: string; kind: 'blob' | 'tree'; byteSize?: number; message?: string; updatedAt?: string }> };

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const repository = (await parent()).repository;
  const revision = repository.defaultBranch ?? 'main';
  const [branches, tree] = await Promise.all([
    routeLoad(apiWith<Branches>(fetch, `/repositories/${params.owner}/${params.repo}/branches`)),
    routeLoad(apiWith<Tree>(fetch, `/repositories/${params.owner}/${params.repo}/tree?revision=${encodeURIComponent(revision)}`))
  ]);
  return { ...branches, tree };
};
