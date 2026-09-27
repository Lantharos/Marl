function repositorySection(pathname: string) {
  const match = pathname.match(/^\/[^/]+\/[^/]+(?:\/(.*))?\/?$/);
  return match ? (match[1] ?? '').replace(/\/+$/, '') : null;
}

export function isPublicRepositoryPath(pathname: string) {
  const section = repositorySection(pathname);
  if (section === null) return false;
  return !section
    || section === 'code'
    || section === 'branches'
    || /^(?:tree|blob)\/[^/]+(?:\/.*)?$/.test(section)
    || /^commits\/[^/]+$/.test(section)
    || /^commit\/[^/]+$/.test(section)
    || /^issues(?:\/\d+)?$/.test(section)
    || /^pulls(?:\/\d+)?$/.test(section)
    || section === 'releases'
    || /^releases\/tag\/.+$/.test(section);
}

export function isIndexableRepositoryPath(pathname: string) {
  const section = repositorySection(pathname);
  return section !== null && isPublicRepositoryPath(pathname);
}
