function storageKey(pullId: string, revision: string) {
  return `marl:viewed:${pullId}:${revision}`;
}

export function readViewed(pullId: string, revision: string): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(pullId, revision)) ?? '[]') as unknown;
    return new Set(Array.isArray(saved) ? saved.filter((path): path is string => typeof path === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeViewed(pullId: string, revision: string, paths: Set<string>) {
  try {
    if (paths.size) localStorage.setItem(storageKey(pullId, revision), JSON.stringify([...paths]));
    else localStorage.removeItem(storageKey(pullId, revision));
  } catch {}
}
