export function encodeRevision(revision: string) {
  return encodeURIComponent(revision);
}

export function encodeRepositoryPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}
