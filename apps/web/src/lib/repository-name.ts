export function repositoryName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 100);
}

export function validRepositoryName(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(value);
}

export function completeRepositoryName(value: string) {
  return value.replace(/-+$/, '');
}
