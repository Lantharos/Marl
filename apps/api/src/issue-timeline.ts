import type { IssueComment, IssueEvent, IssueTimelineItem, IssueTimelineWindow, WorkItemReferenceEvent } from '@marl/contracts';
import type { Principal } from './auth';
import type { Env } from './platform';
import { hydrateReferenceEvents } from './work-item-references';

type TimelineRow = { sequence: number; kind: IssueTimelineItem['kind']; entityId: string; createdAt: string };
type CommentRow = Omit<IssueComment, 'deleted' | 'canEdit'> & { deletedAt: string | null };
type EventRow = Omit<IssueEvent, 'details'> & { details: string };

export async function initialIssueTimeline(env: Env, principal: Principal, issueId: string, canManage = false): Promise<IssueTimelineWindow> {
  const [first, recent, count] = await Promise.all([
    timelineRows(env, issueId, 'ORDER BY sequence LIMIT 2'),
    timelineRows(env, issueId, 'ORDER BY sequence DESC LIMIT 30'),
    env.DB.prepare('SELECT COUNT(*) AS count FROM issue_timeline WHERE issue_id=?').bind(issueId).first<{ count: number }>()
  ]);
  const rows = uniqueRows([...first, ...recent]).sort((left, right) => left.sequence - right.sequence);
  const total = Number(count?.count ?? 0);
  return { items: await hydrate(env, principal, rows, canManage), total, hidden: Math.max(0, total - rows.length), loadBeforeSequence: recent.length ? Math.min(...recent.map((row) => row.sequence)) : undefined, firstBoundarySequence: first.at(-1)?.sequence };
}

export async function olderIssueTimeline(env: Env, principal: Principal, issueId: string, before: number, after: number, canManage = false): Promise<IssueTimelineWindow> {
  const result = await env.DB.prepare('SELECT sequence,kind,entity_id AS entityId,created_at AS createdAt FROM issue_timeline WHERE issue_id=? AND sequence<? AND sequence>? ORDER BY sequence DESC LIMIT 30').bind(issueId, before, after).all<TimelineRow>();
  const rows = result.results.reverse();
  const oldest = rows[0]?.sequence ?? before;
  const remaining = await env.DB.prepare('SELECT COUNT(*) AS count FROM issue_timeline WHERE issue_id=? AND sequence<? AND sequence>?').bind(issueId, oldest, after).first<{ count: number }>();
  return { items: await hydrate(env, principal, rows, canManage), total: Number(remaining?.count ?? 0) + rows.length, hidden: Number(remaining?.count ?? 0), loadBeforeSequence: oldest, firstBoundarySequence: after };
}

function timelineRows(env: Env, issueId: string, suffix: string) {
  return env.DB.prepare(`SELECT sequence,kind,entity_id AS entityId,created_at AS createdAt FROM issue_timeline WHERE issue_id=? ${suffix}`).bind(issueId).all<TimelineRow>().then((result) => result.results);
}

function uniqueRows(rows: TimelineRow[]) {
  return [...new Map(rows.map((row) => [row.sequence, row])).values()];
}

async function hydrate(env: Env, principal: Principal, rows: TimelineRow[], canManage: boolean): Promise<IssueTimelineItem[]> {
  const commentIds = rows.filter((row) => row.kind === 'comment').map((row) => row.entityId);
  const eventIds = rows.filter((row) => row.kind === 'event').map((row) => row.entityId);
  const referenceIds = rows.filter((row) => row.kind === 'reference').map((row) => row.entityId);
  const [comments, events, references] = await Promise.all([
    selectIds<CommentRow>(env, `SELECT issue_comments.id,issue_comments.author_id AS authorId,users.handle AS author,users.display_name AS authorDisplayName,users.avatar_url AS authorAvatarUrl,issue_comments.body,issue_comments.created_at AS createdAt,issue_comments.updated_at AS updatedAt,issue_comments.deleted_at AS deletedAt FROM issue_comments JOIN users ON users.id=issue_comments.author_id WHERE issue_comments.id IN`, commentIds),
    selectIds<EventRow>(env, `SELECT issue_events.id,users.handle AS actor,users.display_name AS actorDisplayName,issue_events.kind,issue_events.details,issue_events.created_at AS createdAt FROM issue_events JOIN users ON users.id=issue_events.actor_id WHERE issue_events.id IN`, eventIds),
    hydrateReferenceEvents(env, principal, referenceIds)
  ]);
  const values = new Map<string, IssueComment | IssueEvent | WorkItemReferenceEvent>();
  for (const { deletedAt, ...comment } of comments) values.set(comment.id, { ...comment, body: deletedAt ? '' : comment.body, deleted: Boolean(deletedAt), canEdit: canManage || comment.authorId === principal.id });
  for (const event of events) values.set(event.id, { ...event, details: parseDetails(event.details) });
  for (const reference of references) values.set(reference.id, reference);
  const hydrated: IssueTimelineItem[] = [];
  for (const row of rows) {
    const value = values.get(row.entityId);
    if (row.kind === 'comment' && value && 'author' in value) hydrated.push({ sequence: Number(row.sequence), kind: 'comment', createdAt: row.createdAt, value });
    if (row.kind === 'event' && value && 'actor' in value) hydrated.push({ sequence: Number(row.sequence), kind: 'event', createdAt: row.createdAt, value });
    if (row.kind === 'reference' && value && !('actor' in value) && !('author' in value)) hydrated.push({ sequence: Number(row.sequence), kind: 'reference', createdAt: row.createdAt, value });
  }
  return hydrated;
}

function selectIds<T>(env: Env, prefix: string, ids: string[]): Promise<T[]> {
  if (!ids.length) return Promise.resolve([]);
  return env.DB.prepare(`${prefix} (${ids.map(() => '?').join(',')})`).bind(...ids).all<T>().then((result) => result.results);
}

function parseDetails(value: string): Record<string, string> {
  try { return JSON.parse(value) as Record<string, string>; }
  catch { return {}; }
}
