import type { RepositorySummary } from '@marl/contracts';
import { pageResult, pageSize, readCursor } from './cursor';
import { validIdentitySlug } from './domain';
import { json, problem } from './http';
import { readListQuery } from './list-query';
import type { Env } from './platform';

export async function listProfileRepositories(request: Request, env: Env, identity: string) {
  if (!validIdentitySlug(identity)) return problem(404, 'profile_not_found', 'Profile not found.');
  const owner = await env.DB.prepare(`SELECT slug FROM organizations WHERE slug=? COLLATE NOCASE`).bind(identity).first<{ slug: string }>();
  if (!owner) return problem(404, 'profile_not_found', 'Profile not found.');
  const url = new URL(request.url);
  const search = readListQuery(url);
  if ('error' in search) return search.error;
  const visibility = url.searchParams.get('visibility') ?? 'all';
  if (!['all', 'active', 'archived'].includes(visibility)) return problem(422, 'invalid_filter', 'Repository filter is invalid.');
  const cursor = readCursor(url);
  if (url.searchParams.has('cursor') && !cursor) return problem(422, 'invalid_cursor', 'Repository cursor is invalid.');
  const limit = pageSize(url, 30, 50);
  const state = visibility === 'active' ? 'AND repositories.archived_at IS NULL' : visibility === 'archived' ? 'AND repositories.archived_at IS NOT NULL' : '';
  const after = cursor ? 'AND (repositories.updated_at < ? OR (repositories.updated_at = ? AND repositories.id < ?))' : '';
  const query = search.query ? `AND (repositories.name LIKE ? ESCAPE '\\' OR repositories.description LIKE ? ESCAPE '\\')` : '';
  const rows = await env.DB.prepare(`SELECT repositories.id,organizations.slug AS owner,repositories.name,repositories.description,repositories.icon_url AS iconUrl,repositories.visibility,repositories.default_branch AS defaultBranch,repositories.updated_at AS updatedAt,repositories.archived_at AS archivedAt FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE organizations.slug=? COLLATE NOCASE AND repositories.visibility='public' AND repositories.deletion_scheduled_at IS NULL ${state} ${query} ${after} ORDER BY repositories.updated_at DESC,repositories.id DESC LIMIT ?`).bind(owner.slug, ...(search.query ? [search.like, search.like] : []), ...(cursor ? [cursor.value, cursor.value, cursor.id] : []), limit + 1).all<RepositorySummary>();
  const result = pageResult(rows.results, limit, row => ({ value: row.updatedAt, id: row.id }));
  return json({ owner: owner.slug, repositories: result.items, nextCursor: result.nextCursor });
}
