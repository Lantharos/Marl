import { encodeRepositoryPath, encodeRevision } from '../repository-path';

export type RevisionLocation = { owner: string; repository: string; revision: string };
export type CodeLocation = RevisionLocation & { defaultBranch: string };
export type CodeLinks = {
  tree: (location: CodeLocation, path?: string) => string;
  blob: (location: RevisionLocation, path: string) => string;
};

export function codeLinks(prefix: string, home: string): CodeLinks {
  const root = ({ owner, repository }: RevisionLocation) => `${prefix}/${owner}/${repository}`;
  return {
    tree: (location, path = '') => {
      if (!path && location.revision === location.defaultBranch) return `${root(location)}${home}`;
      return `${root(location)}/tree/${encodeRevision(location.revision)}${path ? `/${encodeRepositoryPath(path)}` : ''}`;
    },
    blob: (location, path) =>
      `${root(location)}/blob/${encodeRevision(location.revision)}/${encodeRepositoryPath(path)}`
  };
}

export const repositoryLinks = codeLinks('', '/code');
export const treeHref = repositoryLinks.tree;
export const blobHref = repositoryLinks.blob;

export function entryHref(location: CodeLocation, kind: 'blob' | 'tree', path: string, links = repositoryLinks) {
  return kind === 'tree' ? links.tree(location, path) : links.blob(location, path);
}
