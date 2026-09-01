export function releasePath(owner: string, repository: string, tag: string) {
  const encodedTag = tag.split('/').map(encodeURIComponent).join('/');
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases/tag/${encodedTag}`;
}
