export const runStates = ['all', 'active', 'success', 'failure', 'canceled'] as const;
export type RunStateFilter = (typeof runStates)[number];

export function readRunQuery(url: URL) {
  const requested = url.searchParams.get('state');
  const state = runStates.find((value) => value === requested) ?? 'all';
  return { state, query: url.searchParams.get('q') ?? '' };
}

export function runListPath(path: string, filters: { state: RunStateFilter; query: string; cursor?: string }) {
  const params = new URLSearchParams({ limit: '30' });
  if (filters.state !== 'all') params.set('state', filters.state);
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.cursor) params.set('cursor', filters.cursor);
  return `${path}${path.includes('?') ? '&' : '?'}${params}`;
}
