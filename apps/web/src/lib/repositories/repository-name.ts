export function repositoryName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/[-._]{2,}/g, '-')
    .replace(/^[-._]+/, '')
    .slice(0, 100);
}

export function completeRepositoryName(value: string) {
  return value.replace(/[-._]+$/, '');
}
