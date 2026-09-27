export function encodeRevision(revision: string) {
  return encodeURIComponent(revision);
}

export function encodeRepositoryPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function repositoryDocumentPath(owner: string, repository: string, revision: string, path: string) {
  return `/repositories/${owner}/${repository}/document/${encodeRevision(revision)}/${encodeRepositoryPath(path)}`;
}
