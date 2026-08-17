import type { PullTimelineItem, PullTimelineWindow } from '@sty/contracts';
import type { Principal } from './auth';
import type { Env } from './platform';

type TimelineRow = { sequence: number; kind: PullTimelineItem['kind']; entityId: string; createdAt: string };

export async function initialPullTimeline(env: Env, principal: Principal, pullId: string): Promise<PullTimelineWindow> {
  const [first, recent, count] = await Promise.all([
    timelineRows(env, pullId, 'ORDER BY sequence LIMIT 2'),
    timelineRows(env, pullId, 'ORDER BY sequence DESC LIMIT 30'),
    env.DB.prepare('SELECT COUNT(*) AS count FROM pull_timeline WHERE pull_request_id=?').bind(pullId).first<{ count: number }>()
  ]);
  const rows = uniqueRows([...first, ...recent]).sort((a, b) => a.sequence - b.sequence);
  const total = Number(count?.count ?? 0);
  return {
    items: await hydrateTimeline(env, principal, rows),
    total,
    hidden: Math.max(0, total - rows.length),
    loadBeforeSequence: recent.length ? Math.min(...recent.map((row) => row.sequence)) : undefined,
    firstBoundarySequence: first.length ? Math.max(...first.map((row) => row.sequence)) : undefined,
    newestLoadedSequence: rows.at(-1)?.sequence
  };
}

export async function olderPullTimeline(env: Env, principal: Principal, pullId: string, before: number, after: number): Promise<PullTimelineWindow> {
  const rows = await env.DB.prepare(`SELECT sequence,kind,entity_id AS entityId,created_at AS createdAt FROM pull_timeline WHERE pull_request_id=? AND sequence<? AND sequence>? ORDER BY sequence DESC LIMIT 30`).bind(pullId, before, after).all<TimelineRow>();
  const ordered = rows.results.reverse();
  const oldest = ordered[0]?.sequence ?? before;
  const remaining = await env.DB.prepare('SELECT COUNT(*) AS count FROM pull_timeline WHERE pull_request_id=? AND sequence<? AND sequence>?').bind(pullId, oldest, after).first<{ count: number }>();
  return {
    items: await hydrateTimeline(env, principal, ordered),
    total: Number(remaining?.count ?? 0) + ordered.length,
    hidden: Number(remaining?.count ?? 0),
    loadBeforeSequence: oldest,
    firstBoundarySequence: after,
    newestLoadedSequence: ordered.at(-1)?.sequence
  };
}

export async function allPullThreads(env: Env, principal: Principal, pullId: string): Promise<PullTimelineItem[]> {
  const rows = await env.DB.prepare(`SELECT sequence,kind,entity_id AS entityId,created_at AS createdAt FROM pull_timeline WHERE pull_request_id=? AND kind='thread' ORDER BY sequence`).bind(pullId).all<TimelineRow>();
  return hydrateTimeline(env, principal, rows.results);
}

function timelineRows(env: Env, pullId: string, suffix: string): Promise<TimelineRow[]> {
  return env.DB.prepare(`SELECT sequence,kind,entity_id AS entityId,created_at AS createdAt FROM pull_timeline WHERE pull_request_id=? ${suffix}`).bind(pullId).all<TimelineRow>().then((result) => result.results);
}

function uniqueRows(rows: TimelineRow[]): TimelineRow[] {
  return [...new Map(rows.map((row) => [row.sequence, row])).values()];
}

async function hydrateTimeline(env: Env, principal: Principal, rows: TimelineRow[]): Promise<PullTimelineItem[]> {
  const ids = (kind: TimelineRow['kind']) => rows.filter((row) => row.kind === kind).map((row) => row.entityId);
  const commentIds = ids('comment');
  const reviewIds = ids('review');
  const threadIds = ids('thread');
  const eventIds = ids('event');
  const [comments, reviews, threads, threadComments, events] = await Promise.all([
    selectIds(env, `SELECT pull_request_comments.id,pull_request_comments.author_id AS authorId,users.handle AS author,users.avatar_url AS authorAvatarUrl,pull_request_comments.body,pull_request_comments.created_at AS createdAt,pull_request_comments.updated_at AS updatedAt,pull_request_comments.deleted_at AS deletedAt FROM pull_request_comments JOIN users ON users.id=pull_request_comments.author_id WHERE pull_request_comments.id IN`, commentIds),
    selectIds(env, `SELECT pull_request_reviews.id,pull_request_reviews.author_id AS authorId,users.handle AS author,users.avatar_url AS authorAvatarUrl,pull_request_reviews.state,pull_request_reviews.body,pull_request_reviews.commit_id AS commitId,pull_request_reviews.created_at AS createdAt FROM pull_request_reviews JOIN users ON users.id=pull_request_reviews.author_id WHERE pull_request_reviews.id IN`, reviewIds),
    selectIds(env, `SELECT review_threads.id,review_threads.path,review_threads.side,review_threads.line,COALESCE(review_threads.start_side,review_threads.side) AS startSide,COALESCE(review_threads.start_line,review_threads.line) AS startLine,review_threads.commit_id AS commitId,review_threads.created_at AS createdAt,review_threads.commit_id!=pull_requests.source_commit_id AS outdated,review_threads.resolved_at IS NOT NULL AS resolved FROM review_threads JOIN pull_requests ON pull_requests.id=review_threads.pull_request_id WHERE review_threads.id IN`, threadIds),
    selectIds(env, `SELECT review_comments.id,review_comments.thread_id AS threadId,review_comments.author_id AS authorId,users.handle AS author,users.avatar_url AS authorAvatarUrl,review_comments.body,review_comments.created_at AS createdAt,review_comments.updated_at AS updatedAt,review_comments.deleted_at AS deletedAt FROM review_comments JOIN users ON users.id=review_comments.author_id WHERE review_comments.thread_id IN`, threadIds, 'ORDER BY review_comments.created_at'),
    selectIds(env, `SELECT pull_request_events.id,users.handle AS actor,pull_request_events.kind,pull_request_events.details,pull_request_events.created_at AS createdAt FROM pull_request_events JOIN users ON users.id=pull_request_events.actor_id WHERE pull_request_events.id IN`, eventIds)
  ]);
  const entities = new Map<string, unknown>();
  const commentsByThread = new Map<string, Record<string, unknown>[]>();
  for (const comment of threadComments) {
    const threadId = comment.threadId as string;
    const values = commentsByThread.get(threadId) ?? [];
    values.push({ ...comment, body: comment.deletedAt ? '' : comment.body, deleted: Boolean(comment.deletedAt), canEdit: comment.authorId === principal.id });
    commentsByThread.set(threadId, values);
  }
  for (const comment of comments) entities.set(comment.id as string, { ...comment, body: comment.deletedAt ? '' : comment.body, deleted: Boolean(comment.deletedAt), canEdit: comment.authorId === principal.id });
  for (const review of reviews) entities.set(review.id as string, review);
  for (const thread of threads) entities.set(thread.id as string, {
    ...thread,
    outdated: Boolean(thread.outdated),
    resolved: Boolean(thread.resolved),
    comments: commentsByThread.get(thread.id as string) ?? []
  });
  for (const event of events) entities.set(event.id as string, { ...event, details: parseDetails(event.details as string) });
  return rows.flatMap((row) => {
    const value = entities.get(row.entityId);
    return value ? [{ sequence: Number(row.sequence), kind: row.kind, createdAt: row.createdAt, value } as PullTimelineItem] : [];
  });
}

async function selectIds(env: Env, prefix: string, ids: string[], suffix = ''): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return env.DB.prepare(`${prefix} (${placeholders}) ${suffix}`).bind(...ids).all().then((result) => result.results);
}

function parseDetails(value: string): Record<string, string> {
  try { return JSON.parse(value) as Record<string, string>; }
  catch { return {}; }
}
