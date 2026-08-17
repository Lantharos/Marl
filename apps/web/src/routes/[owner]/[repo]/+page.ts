import { apiTextWith, apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branches = { defaultBranch: string; branches: Array<{ name: string; commitId: string; title: string; updatedAt: string }> };
type Tree = { commit: { id: string; shortId: string; title: string; author: string; authorAvatarUrl?: string | null; authoredAt: string; signatureStatus: string }; entries: Array<{ path: string; name: string; kind: 'blob' | 'tree'; byteSize?: number; message?: string; updatedAt?: string }> };
export type RepositoryDocument = { path: string; label: string };

const documentNames = [
  [/^readme(?:\.(?:md|markdown|txt))?$/i, 'README'],
  [/^(?:license|copying)(?:\.(?:md|markdown|txt))?$/i, 'License'],
  [/^contributing(?:\.(?:md|markdown|txt))?$/i, 'Contributing'],
  [/^code[_-]of[_-]conduct(?:\.(?:md|markdown|txt))?$/i, 'Code of conduct'],
  [/^security(?:\.(?:md|markdown|txt))?$/i, 'Security'],
  [/^support(?:\.(?:md|markdown|txt))?$/i, 'Support']
] as const;

function repositoryDocuments(entries: Tree['entries']): RepositoryDocument[] {
  return documentNames.flatMap(([pattern, label]) => {
    const entry = entries.find((candidate) => candidate.kind === 'blob' && pattern.test(candidate.name));
    return entry ? [{ path: entry.path, label }] : [];
  });
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const repository = (await parent()).repository;
  const revision = repository.defaultBranch ?? 'main';
  const branchesPromise = routeLoad(apiWith<Branches>(fetch, `/repositories/${params.owner}/${params.repo}/branches`));
  const treePromise = routeLoad(apiWith<Tree>(fetch, `/repositories/${params.owner}/${params.repo}/tree?revision=${encodeURIComponent(revision)}`));
  const [branches, tree] = await Promise.all([branchesPromise, treePromise]);
  const documents = repositoryDocuments(tree.entries);
  const activeDocument = documents[0] ?? null;
  const documentContent = activeDocument ? await apiTextWith(fetch, `/repositories/${params.owner}/${params.repo}/blob/${encodeURIComponent(revision)}/${activeDocument.path.split('/').map(encodeURIComponent).join('/')}`).catch(() => '') : '';
  return { ...branches, tree, documents, activeDocument, documentContent };
};
