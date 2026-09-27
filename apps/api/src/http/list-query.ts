import { problem } from './http';

export function readListQuery(url: URL): { error: Response } | { query: string; like: string } {
  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length > 100) return { error: problem(422, 'search_too_long', 'Search queries are limited to 100 characters.') };
  const like = `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  return { query, like };
}
