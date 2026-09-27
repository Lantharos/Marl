import { encodeRepositoryPath, encodeRevision } from '../repository-path';

export function entryHref(owner: string, repository: string, revision: string, kind: 'blob' | 'tree', path: string) {
  const suffix = path ? `/${encodeRepositoryPath(path)}` : '';
  return `/${owner}/${repository}/${kind}/${encodeRevision(revision)}${suffix}`;
}
