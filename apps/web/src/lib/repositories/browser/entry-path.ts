import { encodeRepositoryPath, encodeRevision } from '../repository-path';

export type RevisionLocation = { owner: string; repository: string; revision: string };
export type CodeLocation = RevisionLocation & { defaultBranch: string };

export function treeHref({ owner, repository, revision, defaultBranch }: CodeLocation, path = '') {
  if (!path && revision === defaultBranch) return `/${owner}/${repository}/code`;
  return `/${owner}/${repository}/tree/${encodeRevision(revision)}${path ? `/${encodeRepositoryPath(path)}` : ''}`;
}

export function blobHref({ owner, repository, revision }: RevisionLocation, path: string) {
  return `/${owner}/${repository}/blob/${encodeRevision(revision)}/${encodeRepositoryPath(path)}`;
}

export function entryHref(location: CodeLocation, kind: 'blob' | 'tree', path: string) {
  return kind === 'tree' ? treeHref(location, path) : blobHref(location, path);
}
