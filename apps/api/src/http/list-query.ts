import { problem } from './http';

export function readListQuery(url: URL): { error: Response } | { query: string; like: string } {
  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length > 100)
    return { error: problem(422, 'search_too_long', 'Search queries are limited to 100 characters.') };
  return { query, like: likePattern(query) };
}

export function likePattern(query: string) {
  return `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}
