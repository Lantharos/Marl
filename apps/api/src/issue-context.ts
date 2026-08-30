import type { IssueLabel, IssuePerson, IssueSummary } from '@marl/contracts';
import type { Principal } from './auth';
import { identifier } from './domain';
import type { Env } from './platform';

export type IssueRow = {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  body: string;
  authorId: string;
  author: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  state: 'open' | 'closed';
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: string;
  repository: string;
  commentCount: number;
};

export const issueSelect = `SELECT issues.id,issues.repository_id AS repositoryId,issues.number,issues.title,issues.body,issues.author_id AS authorId,users.handle AS author,users.display_name AS authorDisplayName,users.avatar_url AS authorAvatarUrl,issues.state,issues.locked_at AS lockedAt,issues.created_at AS createdAt,issues.updated_at AS updatedAt,organizations.slug AS owner,repositories.name AS repository,(SELECT COUNT(*) FROM issue_comments WHERE issue_comments.issue_id=issues.id AND issue_comments.deleted_at IS NULL) AS commentCount FROM issues JOIN repositories ON repositories.id=issues.repository_id JOIN organizations ON organizations.id=repositories.organization_id JOIN users ON users.id=issues.author_id`;

export function createIssueEvent(env: Env, issueId: string, actor: Pick<Principal, 'id' | 'handle' | 'displayName'>, kind: string, details: Record<string, string> = {}) {
  const id = identifier('event');
  const createdAt = new Date().toISOString();
  return {
    statement: env.DB.prepare('INSERT INTO issue_events (id,issue_id,actor_id,kind,details,created_at) VALUES (?,?,?,?,?,?)').bind(id, issueId, actor.id, kind, JSON.stringify(details), createdAt),
    value: { id, actor: actor.handle, actorDisplayName: actor.displayName, kind, details, createdAt }
  };
}

export async function summarizeIssueRows(env: Env, rows: IssueRow[]): Promise<IssueSummary[]> {
  if (!rows.length) return [];
  const placeholders = rows.map(() => '?').join(',');
  const ids = rows.map((row) => row.id);
  const [labelRows, assigneeRows] = await Promise.all([
    env.DB.prepare(`SELECT issue_labels.issue_id AS issueId,repository_labels.id,repository_labels.name,repository_labels.color,repository_labels.description FROM issue_labels JOIN repository_labels ON repository_labels.id=issue_labels.label_id WHERE issue_labels.issue_id IN (${placeholders}) ORDER BY repository_labels.name`).bind(...ids).all<IssueLabel & { issueId: string }>(),
    env.DB.prepare(`SELECT issue_assignees.issue_id AS issueId,users.id,users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl FROM issue_assignees JOIN users ON users.id=issue_assignees.user_id WHERE issue_assignees.issue_id IN (${placeholders}) ORDER BY users.handle`).bind(...ids).all<IssuePerson & { issueId: string }>()
  ]);
  const labels = groupByIssue(labelRows.results);
  const assignees = groupByIssue(assigneeRows.results);
  return rows.map((row) => ({
    id: row.id,
    number: Number(row.number),
    repository: { owner: row.owner, name: row.repository },
    title: row.title,
    author: row.author,
    authorDisplayName: row.authorDisplayName,
    authorAvatarUrl: row.authorAvatarUrl,
    state: row.state,
    labels: labels.get(row.id) ?? [],
    assignees: assignees.get(row.id) ?? [],
    commentCount: Number(row.commentCount),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

function groupByIssue<T extends { issueId: string }>(rows: T[]) {
  const grouped = new Map<string, Array<Omit<T, 'issueId'>>>();
  for (const { issueId, ...value } of rows) grouped.set(issueId, [...(grouped.get(issueId) ?? []), value]);
  return grouped;
}
