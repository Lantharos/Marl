import type { IssueDetail, IssueLabel, IssuePerson } from '@marl/contracts';
import type { Principal } from './auth';
import { pageResult, pageSize, readCursor } from './cursor';
import { json, problem } from './http';
import { issueSelect, summarizeIssueRows, type IssueRow } from './issue-context';
import { initialIssueTimeline, olderIssueTimeline } from './issue-timeline';
import { readListQuery } from './list-query';
import type { Env } from './platform';
import { authorizeRepository, repositoryListFilter } from './repository-access';
import { linkedWorkItems } from './work-item-references';

export async function listIssues(env: Env, principal: Principal | null, owner: string, name: string, url: URL): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const state = url.searchParams.get('state') ?? 'open';
  if (!['open', 'closed', 'all'].includes(state)) return problem(422, 'invalid_issue_state', 'Choose open, closed, or all issues.');
  const search = readListQuery(url);
  if ('error' in search) return search.error;
  const labels = [...new Set(url.searchParams.getAll('label').map((label) => label.trim()).filter(Boolean))];
  if (labels.length > 10) return problem(422, 'too_many_labels', 'Filter by up to ten labels.');
  const limit = pageSize(url, 30, 100);
  const cursor = readCursor(url);
  const filters = ['issues.repository_id=?'];
  const values: unknown[] = [repository.id];
  if (state !== 'all') { filters.push('issues.state=?'); values.push(state); }
  if (search.query) { filters.push(`(issues.title LIKE ? ESCAPE '\\' OR issues.body LIKE ? ESCAPE '\\' OR users.handle LIKE ? ESCAPE '\\')`); values.push(search.like, search.like, search.like); }
  for (const label of labels) { filters.push('EXISTS (SELECT 1 FROM issue_labels JOIN repository_labels ON repository_labels.id=issue_labels.label_id WHERE issue_labels.issue_id=issues.id AND repository_labels.name=? COLLATE NOCASE)'); values.push(label); }
  if (cursor) { filters.push('(issues.updated_at<? OR (issues.updated_at=? AND issues.id<?))'); values.push(cursor.value, cursor.value, cursor.id); }
  const [rows, availableLabels, counts] = await Promise.all([
    env.DB.prepare(`${issueSelect} WHERE ${filters.join(' AND ')} ORDER BY issues.updated_at DESC,issues.id DESC LIMIT ?`).bind(...values, limit + 1).all<IssueRow>(),
    env.DB.prepare('SELECT id,name,color,description FROM repository_labels WHERE repository_id=? ORDER BY name').bind(repository.id).all<IssueLabel>(),
    env.DB.prepare(`SELECT state,COUNT(*) AS count FROM issues WHERE repository_id=? GROUP BY state`).bind(repository.id).all<{ state: 'open' | 'closed'; count: number }>()
  ]);
  const page = pageResult(rows.results, limit, (row) => ({ value: row.updatedAt, id: row.id }));
  return json({ issues: await summarizeIssueRows(env, page.items), nextCursor: page.nextCursor, availableLabels: availableLabels.results, counts: Object.fromEntries(counts.results.map((row) => [row.state, Number(row.count)])) });
}

export async function listAllIssues(env: Env, principal: Principal, url: URL): Promise<Response> {
  const state = url.searchParams.get('state') ?? 'open';
  if (!['open', 'closed', 'all'].includes(state)) return problem(422, 'invalid_issue_state', 'Choose open, closed, or all issues.');
  const search = readListQuery(url);
  if ('error' in search) return search.error;
  const access = repositoryListFilter(principal);
  const limit = pageSize(url, 40, 100);
  const cursor = readCursor(url);
  const filters = [access.sql];
  const values: unknown[] = [...access.values];
  if (state !== 'all') { filters.push('issues.state=?'); values.push(state); }
  if (search.query) { filters.push(`(issues.title LIKE ? ESCAPE '\\' OR organizations.slug LIKE ? ESCAPE '\\' OR repositories.name LIKE ? ESCAPE '\\')`); values.push(search.like, search.like, search.like); }
  if (cursor) { filters.push('(issues.updated_at<? OR (issues.updated_at=? AND issues.id<?))'); values.push(cursor.value, cursor.value, cursor.id); }
  const rows = await env.DB.prepare(`${issueSelect} WHERE ${filters.join(' AND ')} ORDER BY issues.updated_at DESC,issues.id DESC LIMIT ?`).bind(...values, limit + 1).all<IssueRow>();
  const page = pageResult(rows.results, limit, (row) => ({ value: row.updatedAt, id: row.id }));
  return json({ issues: await summarizeIssueRows(env, page.items), nextCursor: page.nextCursor });
}

export async function getIssue(env: Env, principal: Principal | null, owner: string, name: string, number: number): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const row = await env.DB.prepare(`${issueSelect} WHERE issues.repository_id=? AND issues.number=?`).bind(repository.id, number).first<IssueRow>();
  if (!row) return problem(404, 'issue_not_found', 'Issue not found.');
  const canManage = Boolean(await authorizeRepository(env, principal, owner, name, 'repository.triage'));
  const [summary, availableLabels, availableAssignees, timeline, linkedItems] = await Promise.all([
    summarizeIssueRows(env, [row]),
    env.DB.prepare('SELECT id,name,color,description FROM repository_labels WHERE repository_id=? ORDER BY name').bind(repository.id).all<IssueLabel>(),
    repository.role
      ? env.DB.prepare('SELECT users.id,users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl FROM users JOIN organization_members ON organization_members.user_id=users.id WHERE organization_members.organization_id=? ORDER BY users.handle').bind(repository.organizationId).all<IssuePerson>()
      : Promise.resolve({ results: [] as IssuePerson[] }),
    initialIssueTimeline(env, principal, row.id, canManage),
    linkedWorkItems(env, principal, 'issue', row.id)
  ]);
  const issue: IssueDetail = { ...summary[0], body: row.body, authorId: row.authorId, locked: Boolean(row.lockedAt), canEdit: canManage || row.authorId === principal?.id, canManage, availableLabels: availableLabels.results, availableAssignees: availableAssignees.results, linkedItems, timeline };
  return json({ issue });
}

export async function getIssueTimeline(env: Env, principal: Principal | null, owner: string, name: string, number: number, url: URL): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const issue = await env.DB.prepare('SELECT id FROM issues WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string }>();
  if (!issue) return problem(404, 'issue_not_found', 'Issue not found.');
  const before = Number(url.searchParams.get('before'));
  const after = Number(url.searchParams.get('after') ?? 0);
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || before <= after) return problem(422, 'invalid_timeline_cursor', 'Timeline cursor is invalid.');
  const canManage = Boolean(await authorizeRepository(env, principal, owner, name, 'repository.triage'));
  return json({ timeline: await olderIssueTimeline(env, principal, issue.id, before, after, canManage) });
}
