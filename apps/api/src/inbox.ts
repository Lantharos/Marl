import type { InboxItem, InboxPage, InboxReason } from '@marl/contracts';
import type { Principal } from './auth';
import { pageSize, readCursor, writeCursor } from './cursor';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { repositoryListFilter } from './repository-access';
import { inboxStateBody } from './request-schemas';

type Candidate = Omit<InboxItem, 'unread' | 'done'>;
type CandidateRow = {
  id: string;
  owner: string;
  repository: string;
  number: number;
  title: string;
  state: string;
  reason: InboxReason;
  updatedAt: string;
};
type StateRow = { itemKey: string; readAt: string | null; doneAt: string | null };

export async function listInbox(env: Env, principal: Principal, url: URL): Promise<Response> {
  const status = url.searchParams.get('status') ?? 'inbox';
  if (!['inbox', 'unread', 'done'].includes(status)) return problem(422, 'invalid_inbox_status', 'Choose inbox, unread, or done.');
  const all = await inboxItems(env, principal);
  const counts = inboxCounts(all);
  const filtered = all.filter((item) => status === 'done' ? item.done : !item.done && (status !== 'unread' || item.unread));
  const cursor = readCursor(url);
  const afterCursor = cursor ? filtered.filter((item) => timestamp(item.updatedAt) < timestamp(cursor.value) || (timestamp(item.updatedAt) === timestamp(cursor.value) && item.id < cursor.id)) : filtered;
  const limit = pageSize(url, 40, 50);
  const items = afterCursor.slice(0, limit);
  const nextCursor = afterCursor.length > limit && items.length ? writeCursor({ value: items.at(-1)!.updatedAt, id: items.at(-1)!.id }) : null;
  return json({ items, nextCursor, counts } satisfies InboxPage);
}

export async function inboxPreview(env: Env, principal: Principal, limit = 5) {
  const items = await inboxItems(env, principal);
  return {
    items: items.filter((item) => !item.done).slice(0, limit),
    counts: inboxCounts(items)
  };
}

export async function updateInboxState(request: Request, env: Env, principal: Principal, kind: string, id: string): Promise<Response> {
  const itemKey = `${kind}:${id}`;
  if (!/^(issue|pull|run):[a-z0-9_]+$/.test(itemKey)) return problem(404, 'inbox_item_not_found', 'Inbox item not found.');
  const body = await readJson(request, inboxStateBody);
  if (!body || (body.read === undefined && body.done === undefined)) return problem(422, 'invalid_inbox_state', 'Choose whether the item is read or done.');
  if (!(await inboxItems(env, principal)).some((item) => item.id === itemKey)) return problem(404, 'inbox_item_not_found', 'Inbox item not found.');
  const previous = await env.DB.prepare('SELECT read_at AS readAt,done_at AS doneAt FROM inbox_item_states WHERE user_id=? AND item_key=?').bind(principal.id, itemKey).first<{ readAt: string | null; doneAt: string | null }>();
  const now = new Date().toISOString();
  const readAt = body.done === true ? now : body.read === undefined ? previous?.readAt ?? null : body.read ? now : null;
  const doneAt = body.done === undefined ? previous?.doneAt ?? null : body.done ? now : null;
  await env.DB.prepare(`INSERT INTO inbox_item_states (user_id,item_key,read_at,done_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,item_key) DO UPDATE SET read_at=excluded.read_at,done_at=excluded.done_at,updated_at=excluded.updated_at`).bind(principal.id, itemKey, readAt, doneAt, now).run();
  return json({ item: { id: itemKey, unread: !readAt, done: Boolean(doneAt) } });
}

export async function markInboxRead(env: Env, principal: Principal): Promise<Response> {
  const items = (await inboxItems(env, principal)).filter((item) => !item.done && item.unread);
  const now = new Date().toISOString();
  for (let offset = 0; offset < items.length; offset += 50) {
    await env.DB.batch(items.slice(offset, offset + 50).map((item) => env.DB.prepare(`INSERT INTO inbox_item_states (user_id,item_key,read_at,done_at,updated_at) VALUES (?,?,?,NULL,?) ON CONFLICT(user_id,item_key) DO UPDATE SET read_at=excluded.read_at,updated_at=excluded.updated_at`).bind(principal.id, item.id, now, now)));
  }
  return json({ updated: items.length });
}

function inboxCounts(items: InboxItem[]) {
  return {
    inbox: items.filter((item) => !item.done).length,
    unread: items.filter((item) => !item.done && item.unread).length,
    done: items.filter((item) => item.done).length
  };
}

async function inboxItems(env: Env, principal: Principal): Promise<InboxItem[]> {
  if (principal.authType === 'token') return [];
  const candidates = await candidateItems(env, principal);
  const states = await itemStates(env, principal.id, [...candidates.keys()]);
  return [...candidates.values()].map((candidate) => {
    const state = states.get(candidate.id);
    return {
      ...candidate,
      unread: !state?.readAt || timestamp(state.readAt) < timestamp(candidate.updatedAt),
      done: Boolean(state?.doneAt && timestamp(state.doneAt) >= timestamp(candidate.updatedAt))
    };
  }).sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt) || right.id.localeCompare(left.id));
}

async function candidateItems(env: Env, principal: Principal) {
  const access = repositoryListFilter(principal);
  const readable = `(${access.sql} OR repositories.visibility='public') AND repositories.deletion_scheduled_at IS NULL`;
  const issueActivity = `(SELECT MAX(t.created_at) FROM issue_timeline t LEFT JOIN issue_comments c ON t.kind='comment' AND c.id=t.entity_id LEFT JOIN issue_events e ON t.kind='event' AND e.id=t.entity_id LEFT JOIN work_item_references w ON t.kind='reference' AND w.id=t.entity_id WHERE t.issue_id=issues.id AND COALESCE(c.author_id,e.actor_id,w.created_by,'')!=?)`;
  const pullActivity = `(SELECT MAX(t.created_at) FROM pull_timeline t LEFT JOIN pull_request_comments c ON t.kind='comment' AND c.id=t.entity_id LEFT JOIN pull_request_reviews v ON t.kind='review' AND v.id=t.entity_id LEFT JOIN pull_request_events e ON t.kind='event' AND e.id=t.entity_id LEFT JOIN work_item_references w ON t.kind='reference' AND w.id=t.entity_id LEFT JOIN review_comments rc ON t.kind='thread' AND rc.thread_id=t.entity_id AND rc.id=(SELECT id FROM review_comments WHERE thread_id=t.entity_id ORDER BY created_at,id LIMIT 1) WHERE t.pull_request_id=pull_requests.id AND COALESCE(c.author_id,v.author_id,e.actor_id,w.created_by,rc.author_id,'')!=?)`;
  const [issues, pulls, runs, mentions] = await Promise.all([
    env.DB.prepare(`WITH candidates AS (SELECT issues.id,organizations.slug AS owner,repositories.name AS repository,issues.number,issues.title,issues.state,CASE WHEN EXISTS (SELECT 1 FROM issue_assignees WHERE issue_id=issues.id AND user_id=?) THEN 'assignment' WHEN issues.author_id=? THEN 'authored' ELSE 'participating' END AS reason,${issueActivity} AS updatedAt FROM issues JOIN repositories ON repositories.id=issues.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE ${readable} AND (issues.author_id=? OR EXISTS (SELECT 1 FROM issue_assignees WHERE issue_id=issues.id AND user_id=?) OR EXISTS (SELECT 1 FROM issue_comments WHERE issue_id=issues.id AND author_id=?))) SELECT * FROM candidates WHERE updatedAt IS NOT NULL ORDER BY unixepoch(updatedAt) DESC,id DESC LIMIT 150`).bind(principal.id, principal.id, principal.id, ...access.values, principal.id, principal.id, principal.id).all<CandidateRow>(),
    env.DB.prepare(`WITH candidates AS (SELECT pull_requests.id,organizations.slug AS owner,repositories.name AS repository,pull_requests.number,pull_requests.title,pull_requests.state,CASE WHEN EXISTS (SELECT 1 FROM pull_request_assignees WHERE pull_request_id=pull_requests.id AND user_id=?) THEN 'assignment' WHEN pull_requests.author_id=? THEN 'authored' ELSE 'participating' END AS reason,${pullActivity} AS updatedAt FROM pull_requests JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE ${readable} AND (pull_requests.author_id=? OR EXISTS (SELECT 1 FROM pull_request_assignees WHERE pull_request_id=pull_requests.id AND user_id=?) OR EXISTS (SELECT 1 FROM pull_request_comments WHERE pull_request_id=pull_requests.id AND author_id=?) OR EXISTS (SELECT 1 FROM pull_request_reviews WHERE pull_request_id=pull_requests.id AND author_id=?) OR EXISTS (SELECT 1 FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id WHERE review_threads.pull_request_id=pull_requests.id AND review_comments.author_id=?))) SELECT * FROM candidates WHERE updatedAt IS NOT NULL ORDER BY unixepoch(updatedAt) DESC,id DESC LIMIT 150`).bind(principal.id, principal.id, principal.id, ...access.values, principal.id, principal.id, principal.id, principal.id, principal.id).all<CandidateRow>(),
    env.DB.prepare(`SELECT runs.id,organizations.slug AS owner,repositories.name AS repository,runs.number,runs.name AS title,runs.state,'failure' AS reason,COALESCE(runs.completed_at,runs.created_at) AS updatedAt FROM runs JOIN repositories ON repositories.id=runs.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE ${readable} AND runs.actor_id=? AND runs.state='failure' ORDER BY unixepoch(updatedAt) DESC,runs.id DESC LIMIT 100`).bind(...access.values, principal.id).all<CandidateRow>(),
    env.DB.prepare(`SELECT COALESCE(issues.id,pull_requests.id) AS id,organizations.slug AS owner,repositories.name AS repository,COALESCE(issues.number,pull_requests.number) AS number,COALESCE(issues.title,pull_requests.title) AS title,COALESCE(issues.state,pull_requests.state) AS state,'mention' AS reason,content_mentions.created_at AS updatedAt FROM content_mentions LEFT JOIN issues ON issues.id=content_mentions.source_issue_id LEFT JOIN pull_requests ON pull_requests.id=content_mentions.source_pull_id JOIN repositories ON repositories.id=COALESCE(issues.repository_id,pull_requests.repository_id) JOIN organizations ON organizations.id=repositories.organization_id WHERE ${readable} AND content_mentions.user_id=? ORDER BY content_mentions.created_at DESC,content_mentions.content_id DESC LIMIT 150`).bind(...access.values, principal.id).all<CandidateRow>()
  ]);
  const result = new Map<string, Candidate>();
  for (const row of [...issues.results, ...pulls.results, ...runs.results]) mergeCandidate(result, row);
  for (const row of mentions.results) mergeCandidate(result, row);
  return result;
}

function mergeCandidate(items: Map<string, Candidate>, row: CandidateRow) {
  const kind = row.id.startsWith('issue_') ? 'issue' : row.id.startsWith('pr_') ? 'pull' : 'run';
  const id = `${kind}:${row.id}`;
  const previous = items.get(id);
  const reason = row.reason === 'mention' || !previous ? row.reason : previous.reason;
  const updatedAt = previous && timestamp(previous.updatedAt) > timestamp(row.updatedAt) ? previous.updatedAt : row.updatedAt;
  items.set(id, {
    id,
    kind,
    reason,
    repository: { owner: row.owner, name: row.repository },
    number: Number(row.number),
    title: row.title,
    state: row.state,
    href: kind === 'run' ? `/${row.owner}/${row.repository}/runs/${row.number}` : `/${row.owner}/${row.repository}/${kind === 'issue' ? 'issues' : 'pulls'}/${row.number}`,
    updatedAt
  });
}

function timestamp(value: string) {
  const parsed = Date.parse(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function itemStates(env: Env, userId: string, keys: string[]) {
  const states = new Map<string, StateRow>();
  for (let offset = 0; offset < keys.length; offset += 80) {
    const batch = keys.slice(offset, offset + 80);
    const rows = await env.DB.prepare(`SELECT item_key AS itemKey,read_at AS readAt,done_at AS doneAt FROM inbox_item_states WHERE user_id=? AND item_key IN (${batch.map(() => '?').join(',')})`).bind(userId, ...batch).all<StateRow>();
    for (const row of rows.results) states.set(row.itemKey, row);
  }
  return states;
}
