import type { Principal } from './auth';
import { branchRuleFor, branchRulesFor, type BranchRule, type MergeMethod } from './branch-rules';
import { identifier, safeRepositoryPath, validBranchName } from './domain';
import { pinPullRefs, requestGatewayWrite } from './git-writes';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { mergeRequirements, type CheckCounts, type RequirementReview } from './pull-requirements';
import { allPullThreads, initialPullTimeline, olderPullTimeline } from './pull-timeline';
import { commitPullUpdate, pullUpdatesAfter } from './pull-realtime';

type Repo = { id: string; owner: string; name: string; visibility: 'public' | 'private'; organizationId: string };
type PullRow = { id: string; repositoryId: string; number: number; title: string; body: string; authorId: string; author: string; sourceBranch: string; targetBranch: string; sourceCommitId: string; targetCommitId: string; state: 'draft' | 'open' | 'merged' | 'closed'; mergedCommitId?: string; mergeMethod?: MergeMethod; lockedAt?: string; realtimeVersion: number; createdAt: string; updatedAt: string; owner: string; repository: string };

const pullSelect = `SELECT pull_requests.id, pull_requests.repository_id AS repositoryId, pull_requests.number, pull_requests.title, pull_requests.body, pull_requests.author_id AS authorId, users.handle AS author, pull_requests.source_branch AS sourceBranch, pull_requests.target_branch AS targetBranch, pull_requests.source_commit_id AS sourceCommitId, pull_requests.target_commit_id AS targetCommitId, pull_requests.state, pull_requests.merged_commit_id AS mergedCommitId, pull_requests.merge_method AS mergeMethod, pull_requests.locked_at AS lockedAt, pull_requests.realtime_version AS realtimeVersion, pull_requests.created_at AS createdAt, pull_requests.updated_at AS updatedAt, organizations.slug AS owner, repositories.name AS repository FROM pull_requests JOIN repositories ON repositories.id = pull_requests.repository_id JOIN organizations ON organizations.id = repositories.organization_id JOIN users ON users.id = pull_requests.author_id`;

function createPullEvent(env: Env, pullId: string, actor: Principal, kind: string, details: Record<string, string> = {}) {
  const id = identifier('event');
  const createdAt = new Date().toISOString();
  return {
    statement: env.DB.prepare('INSERT INTO pull_request_events (id,pull_request_id,actor_id,kind,details,created_at) VALUES (?,?,?,?,?,?)').bind(id, pullId, actor.id, kind, JSON.stringify(details), createdAt),
    value: { id, actor: actor.handle, kind, details, createdAt }
  };
}

async function repo(env: Env, owner: string, name: string): Promise<Repo | null> {
  return env.DB.prepare(`SELECT repositories.id, organizations.slug AS owner, repositories.name, repositories.visibility, repositories.organization_id AS organizationId FROM repositories JOIN organizations ON organizations.id = repositories.organization_id WHERE organizations.slug = ? COLLATE NOCASE AND repositories.name = ? COLLATE NOCASE`).bind(owner, name).first<Repo>();
}

async function membership(env: Env, principal: Principal, repository: Repo): Promise<boolean> {
  return Boolean(await env.DB.prepare('SELECT 1 AS allowed FROM organization_members WHERE organization_id = ? AND user_id = ?').bind(repository.organizationId, principal.id).first());
}

type ReviewStatus = 'none' | 'requested' | 'approved' | 'changes_requested';

function reviewStatusFor(pull: PullRow, rule: BranchRule, reviews: RequirementReview[]): ReviewStatus {
  const latest = new Map<string, string>();
  for (const review of reviews) if (!rule.dismissStaleReviews || review.commitId === pull.sourceCommitId) latest.set(review.authorId, review.state);
  const states = [...latest.values()];
  return states.includes('changes_requested') ? 'changes_requested' : states.includes('approved') ? 'approved' : pull.state === 'open' ? 'requested' : 'none';
}

function latestReviews(env: Env, pullId: string) {
  return env.DB.prepare(`SELECT authorId,state,commitId FROM (SELECT author_id AS authorId,state,commit_id AS commitId,created_at AS createdAt,ROW_NUMBER() OVER (PARTITION BY author_id,commit_id ORDER BY created_at DESC,id DESC) AS rank FROM pull_request_reviews WHERE pull_request_id=?) WHERE rank=1 ORDER BY createdAt`).bind(pullId).all<RequirementReview>();
}

function summary(row: PullRow, checks: CheckCounts = { total: 0, passed: 0, failed: 0, running: 0 }, reviewStatus: ReviewStatus = 'none', unresolved = 0) {
  const blocked = checks.failed > 0 || reviewStatus === 'changes_requested' || unresolved > 0;
  const state = row.state === 'open' ? (blocked ? 'blocked' : checks.running === 0 ? 'mergeable' : 'open') : row.state;
  return { id: row.id, number: row.number, repository: { owner: row.owner, name: row.repository }, title: row.title, author: row.author, sourceBranch: row.sourceBranch, targetBranch: row.targetBranch, state, reviewStatus, checkSummary: checks, updatedAt: row.updatedAt };
}

async function summarizeRows(env: Env, rows: PullRow[]) {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => '?').join(',');
  const ids = rows.map((row) => row.id);
  const [checkRows, reviewRows, threadRows, rules] = await Promise.all([
    env.DB.prepare(`SELECT pull_requests.id AS pullId, COUNT(checks.id) AS total, COALESCE(SUM(checks.state = 'success'), 0) AS passed, COALESCE(SUM(checks.state IN ('failure', 'canceled')), 0) AS failed, COALESCE(SUM(checks.state IN ('queued', 'running')), 0) AS running FROM pull_requests LEFT JOIN checks ON checks.repository_id = pull_requests.repository_id AND checks.commit_id = pull_requests.source_commit_id WHERE pull_requests.id IN (${placeholders}) GROUP BY pull_requests.id`).bind(...ids).all<{ pullId: string; total: number; passed: number; failed: number; running: number }>(),
    env.DB.prepare(`SELECT pullId,authorId,state,commitId FROM (SELECT pull_request_id AS pullId,author_id AS authorId,state,commit_id AS commitId,created_at AS createdAt,ROW_NUMBER() OVER (PARTITION BY pull_request_id,author_id,commit_id ORDER BY created_at DESC,id DESC) AS rank FROM pull_request_reviews WHERE pull_request_id IN (${placeholders})) WHERE rank=1 ORDER BY createdAt`).bind(...ids).all<{ pullId: string; authorId: string; state: 'commented' | 'approved' | 'changes_requested'; commitId: string }>(),
    env.DB.prepare(`SELECT review_threads.pull_request_id AS pullId, COUNT(*) AS unresolved FROM review_threads JOIN pull_requests ON pull_requests.id = review_threads.pull_request_id AND pull_requests.source_commit_id = review_threads.commit_id WHERE review_threads.pull_request_id IN (${placeholders}) AND review_threads.resolved_at IS NULL GROUP BY review_threads.pull_request_id`).bind(...ids).all<{ pullId: string; unresolved: number }>(),
    branchRulesFor(env, rows.map((row) => ({ repositoryId: row.repositoryId, branch: row.targetBranch })))
  ]);
  const checks = new Map(checkRows.results.map((item) => [item.pullId, { total: Number(item.total), passed: Number(item.passed), failed: Number(item.failed), running: Number(item.running) }]));
  const reviews = new Map<string, Array<{ authorId: string; state: string; commitId: string }>>();
  for (const review of reviewRows.results) {
    const items = reviews.get(review.pullId) ?? [];
    items.push(review);
    reviews.set(review.pullId, items);
  }
  const threads = new Map(threadRows.results.map((item) => [item.pullId, Number(item.unresolved)]));
  return rows.map((row) => {
    const rule = rules.get(`${row.repositoryId}:${row.targetBranch}`) ?? { pattern: row.targetBranch, requiredApprovals: 0, requireChecks: false, requireConversations: true, dismissStaleReviews: true, allowedMergeMethods: ['merge', 'squash', 'rebase'] as MergeMethod[] };
    const rowReviews = reviews.get(row.id) ?? [];
    const reviewStatus = reviewStatusFor(row, rule, rowReviews);
    const counts = checks.get(row.id) ?? { total: 0, passed: 0, failed: 0, running: 0 };
    const unresolved = threads.get(row.id) ?? 0;
    const value = summary(row, counts, reviewStatus, unresolved);
    const requirements = mergeRequirements(row, rule, counts, rowReviews, unresolved);
    return row.state === 'open' ? { ...value, state: requirements.ready ? 'mergeable' : 'blocked' } : value;
  });
}

export async function listAllPulls(env: Env, principal: Principal): Promise<Response> {
  const rows = await env.DB.prepare(`${pullSelect} JOIN organization_members ON organization_members.organization_id = repositories.organization_id WHERE organization_members.user_id = ? AND pull_requests.state IN ('draft','open') ORDER BY pull_requests.updated_at DESC LIMIT 100`).bind(principal.id).all<PullRow>();
  return json({ pullRequests: await summarizeRows(env, rows.results) });
}

export async function listPulls(env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(repository.visibility === 'public' || await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const rows = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id = ? ORDER BY CASE pull_requests.state WHEN 'open' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, pull_requests.updated_at DESC LIMIT 100`).bind(repository.id).all<PullRow>();
  return json({ pullRequests: await summarizeRows(env, rows.results) });
}

export async function createPull(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request);
  if (!body || typeof body.title !== 'string' || body.title.trim().length < 3 || body.title.length > 240 || !validBranchName(body.sourceBranch) || !validBranchName(body.targetBranch) || body.sourceBranch === body.targetBranch) return problem(422, 'invalid_pull_request', 'Title and two different valid branches are required.');
  const branches = await env.DB.prepare('SELECT name, commit_id AS commitId FROM branches WHERE repository_id = ? AND name IN (?, ?)').bind(repository.id, body.sourceBranch, body.targetBranch).all<{ name: string; commitId: string }>();
  const source = branches.results.find((branch) => branch.name === body.sourceBranch);
  const target = branches.results.find((branch) => branch.name === body.targetBranch);
  if (!source || !target) return problem(422, 'branch_not_found', 'Source or target branch does not exist.');
  const duplicate = await env.DB.prepare(`SELECT number FROM pull_requests WHERE repository_id = ? AND source_branch = ? AND target_branch = ? AND state IN ('draft','open')`).bind(repository.id, body.sourceBranch, body.targetBranch).first<{ number: number }>();
  if (duplicate) {
    const existing = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id = ? AND pull_requests.number = ?`).bind(repository.id, duplicate.number).first<PullRow>();
    if (!existing) return problem(409, 'pull_request_exists', `Pull request #${duplicate.number} already proposes this branch.`);
    const pinned = await preservePullRefs(env, repository, existing);
    if (pinned) return pinned;
    return json({ pullRequest: summary(existing) });
  }
  const id = identifier('pr');
  const state = body.draft === true ? 'draft' : 'open';
  await env.DB.prepare(`INSERT INTO pull_requests (id, repository_id, number, title, body, author_id, source_branch, target_branch, source_commit_id, target_commit_id, state) SELECT ?, ?, COALESCE(MAX(number), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ? FROM pull_requests WHERE repository_id = ?`).bind(id, repository.id, body.title.trim(), typeof body.body === 'string' ? body.body.slice(0, 100_000) : '', principal.id, body.sourceBranch, body.targetBranch, source.commitId, target.commitId, state, repository.id).run();
  const created = await env.DB.prepare(`${pullSelect} WHERE pull_requests.id = ?`).bind(id).first<PullRow>();
  if (!created) return problem(500, 'pull_request_create_failed', 'Pull request creation did not persist.');
  const pinned = await preservePullRefs(env, repository, created);
  if (pinned) return pinned;
  return json({ pullRequest: created && summary(created) }, { status: 201 });
}

export async function getPull(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(repository.visibility === 'public' || await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id = ? AND pull_requests.number = ?`).bind(repository.id, number).first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const [reviews, checks, unresolvedThreads, rule, commits, labels, availableLabels, assignees, availableAssignees, timeline] = await Promise.all([
    latestReviews(env, pull.id),
    env.DB.prepare(`SELECT id, name, state, summary, details_url AS detailsUrl, updated_at AS updatedAt FROM checks WHERE repository_id = ? AND commit_id = ? ORDER BY name`).bind(repository.id, pull.sourceCommitId).all<{ state: string }>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM review_threads WHERE pull_request_id=? AND commit_id=? AND resolved_at IS NULL').bind(pull.id, pull.sourceCommitId).first<{ count: number }>(),
    branchRuleFor(env, repository.id, pull.targetBranch),
    pullCommits(env, repository.id, pull.sourceCommitId, pull.targetCommitId),
    env.DB.prepare(`SELECT repository_labels.id,repository_labels.name,repository_labels.color,repository_labels.description FROM repository_labels JOIN pull_request_labels ON pull_request_labels.label_id=repository_labels.id WHERE pull_request_labels.pull_request_id=? ORDER BY repository_labels.name`).bind(pull.id).all(),
    env.DB.prepare(`SELECT id,name,color,description FROM repository_labels WHERE repository_id=? ORDER BY name`).bind(repository.id).all(),
    env.DB.prepare(`SELECT users.id,users.handle,users.display_name AS displayName FROM users JOIN pull_request_assignees ON pull_request_assignees.user_id=users.id WHERE pull_request_assignees.pull_request_id=? ORDER BY users.handle`).bind(pull.id).all(),
    env.DB.prepare(`SELECT users.id,users.handle,users.display_name AS displayName FROM users JOIN organization_members ON organization_members.user_id=users.id WHERE organization_members.organization_id=? ORDER BY users.handle`).bind(repository.organizationId).all(),
    initialPullTimeline(env, principal, pull.id)
  ]);
  const checkSummary = { total: checks.results.length, passed: checks.results.filter((item) => item.state === 'success').length, failed: checks.results.filter((item) => item.state === 'failure' || item.state === 'canceled').length, running: checks.results.filter((item) => item.state === 'running' || item.state === 'queued').length };
  const reviewStatus = reviewStatusFor(pull, rule, reviews.results);
  const unresolved = Number(unresolvedThreads?.count ?? 0);
  const requirements = mergeRequirements(pull, rule, checkSummary, reviews.results, unresolved);
  const pullSummary = summary(pull, checkSummary, reviewStatus, unresolved);
  const state = pull.state === 'open' ? (requirements.ready ? 'mergeable' : 'blocked') : pullSummary.state;
  const comments = timeline.items.filter((item) => item.kind === 'comment').map((item) => item.value);
  const timelineReviews = timeline.items.filter((item) => item.kind === 'review').map((item) => item.value);
  const threads = timeline.items.filter((item) => item.kind === 'thread').map((item) => item.value);
  const events = timeline.items.filter((item) => item.kind === 'event').map((item) => item.value);
  return json({ pullRequest: { ...pullSummary, state, body: pull.body, sourceCommitId: pull.sourceCommitId, targetCommitId: pull.targetCommitId, authorId: pull.authorId, createdAt: pull.createdAt, mergedCommitId: pull.mergedCommitId, mergeMethod: pull.mergeMethod, mergeRequirements: requirements, allowedMergeMethods: rule.allowedMergeMethods, commits: commits.results, comments, reviews: timelineReviews, checks: checks.results, threads, events, labels: labels.results, availableLabels: availableLabels.results, assignees: assignees.results, availableAssignees: availableAssignees.results, locked: Boolean(pull.lockedAt), canManage: await membership(env, principal, repository), realtimeVersion: Number(pull.realtimeVersion), timeline } });
}

export async function getPullTimeline(env: Env, principal: Principal, owner: string, name: string, number: number, url: URL): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(repository.visibility === 'public' || await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const before = Number(url.searchParams.get('before'));
  const after = Number(url.searchParams.get('after'));
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || before <= after) return problem(422, 'invalid_timeline_cursor', 'Timeline cursors are invalid.');
  return json({ timeline: await olderPullTimeline(env, principal, pull.id, before, after) });
}

export async function getPullUpdates(env: Env, principal: Principal, owner: string, name: string, number: number, url: URL): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(repository.visibility === 'public' || await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id,realtime_version AS realtimeVersion FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; realtimeVersion: number }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const after = Number(url.searchParams.get('after') ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return problem(422, 'invalid_realtime_cursor', 'Realtime cursor is invalid.');
  const result = await pullUpdatesAfter(env, pull.id, after);
  return json({ ...result, version: Number(pull.realtimeVersion) });
}

export async function getPullState(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(repository.visibility === 'public' || await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id=? AND pull_requests.number=?`).bind(repository.id, number).first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const [checks, reviews, unresolvedThreads, rule] = await Promise.all([
    env.DB.prepare('SELECT state FROM checks WHERE repository_id=? AND commit_id=?').bind(repository.id, pull.sourceCommitId).all<{ state: string }>(),
    latestReviews(env, pull.id),
    env.DB.prepare('SELECT COUNT(*) AS count FROM review_threads WHERE pull_request_id=? AND commit_id=? AND resolved_at IS NULL').bind(pull.id, pull.sourceCommitId).first<{ count: number }>(),
    branchRuleFor(env, repository.id, pull.targetBranch)
  ]);
  const checkSummary = { total: checks.results.length, passed: checks.results.filter((item) => item.state === 'success').length, failed: checks.results.filter((item) => item.state === 'failure' || item.state === 'canceled').length, running: checks.results.filter((item) => item.state === 'running' || item.state === 'queued').length };
  const requirements = mergeRequirements(pull, rule, checkSummary, reviews.results, Number(unresolvedThreads?.count ?? 0));
  const pullSummary = summary(pull, checkSummary, reviewStatusFor(pull, rule, reviews.results), Number(unresolvedThreads?.count ?? 0));
  const state = pull.state === 'open' ? (requirements.ready ? 'mergeable' : 'blocked') : pullSummary.state;
  return json({ state: { state, sourceCommitId: pull.sourceCommitId, targetCommitId: pull.targetCommitId, mergedCommitId: pull.mergedCommitId, mergeMethod: pull.mergeMethod, checkSummary, mergeRequirements: requirements, realtimeVersion: Number(pull.realtimeVersion) } });
}

export async function connectPullRealtime(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  if (request.headers.get('upgrade') !== 'websocket') return problem(426, 'websocket_required', 'This endpoint requires a WebSocket connection.');
  const repository = await repo(env, owner, name);
  if (!repository || !(repository.visibility === 'public' || await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  return env.PULL_ROOMS.get(env.PULL_ROOMS.idFromName(pull.id)).fetch(request);
}

export async function updatePullDetails(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id,title,body FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; title: string; body: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const body = await readJson(request);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const title = body.title === undefined ? pull.title : typeof body.title === 'string' ? body.title.trim() : '';
  const description = body.body === undefined ? pull.body : typeof body.body === 'string' ? body.body.trim() : '';
  if (title.length < 3 || title.length > 240 || description.length > 100_000) return problem(422, 'invalid_pull_request', 'Title and description are invalid.');
  const events: ReturnType<typeof createPullEvent>[] = [];
  if (title !== pull.title) events.push(createPullEvent(env, pull.id, principal, 'title_changed', { from: pull.title, to: title }));
  if (description !== pull.body) events.push(createPullEvent(env, pull.id, principal, 'description_changed'));
  const statements = events.map((event) => event.statement);
  if (!statements.length) return problem(422, 'unchanged_pull_request', 'No pull request details changed.');
  statements.unshift(env.DB.prepare('UPDATE pull_requests SET title=?,body=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(title, description, pull.id));
  const update = await commitPullUpdate(env, pull.id, 'details.updated', { details: { title, body: description }, timeline: events.map((event) => ({ kind: 'event', value: event.value, createdAt: event.value.createdAt })) }, statements);
  return json({ updated: true, pull: { title, body: description }, update });
}

export async function updatePullMetadata(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id,locked_at AS lockedAt FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; lockedAt?: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const body = await readJson(request);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const [members, repositoryLabels, currentAssignees, currentLabels] = await Promise.all([
    env.DB.prepare(`SELECT users.id,users.handle FROM users JOIN organization_members ON organization_members.user_id=users.id WHERE organization_members.organization_id=?`).bind(repository.organizationId).all<{ id: string; handle: string }>(),
    env.DB.prepare('SELECT id,name FROM repository_labels WHERE repository_id=?').bind(repository.id).all<{ id: string; name: string }>(),
    env.DB.prepare('SELECT user_id AS id FROM pull_request_assignees WHERE pull_request_id=?').bind(pull.id).all<{ id: string }>(),
    env.DB.prepare('SELECT label_id AS id FROM pull_request_labels WHERE pull_request_id=?').bind(pull.id).all<{ id: string }>()
  ]);
  const memberNames = new Map(members.results.map((member) => [member.id, member.handle]));
  const labelNames = new Map(repositoryLabels.results.map((label) => [label.id, label.name]));
  const statements = [];
  const events: ReturnType<typeof createPullEvent>[] = [];
  const addEvent = (kind: string, details: Record<string, string> = {}) => {
    const event = createPullEvent(env, pull.id, principal, kind, details);
    events.push(event);
    statements.push(event.statement);
  };
  if (body.assigneeIds !== undefined) {
    if (!Array.isArray(body.assigneeIds) || body.assigneeIds.length > 10 || body.assigneeIds.some((id: unknown) => typeof id !== 'string')) return problem(422, 'invalid_assignees', 'Choose up to ten repository members.');
    const ids = [...new Set(body.assigneeIds as string[])];
    if (ids.some((id) => !memberNames.has(id))) return problem(422, 'invalid_assignees', 'Every assignee must belong to this repository organization.');
    const previous = new Set(currentAssignees.results.map((item) => item.id));
    const next = new Set(ids);
    if (ids.some((id) => !previous.has(id)) || [...previous].some((id) => !next.has(id))) {
      statements.push(env.DB.prepare('DELETE FROM pull_request_assignees WHERE pull_request_id=?').bind(pull.id));
      for (const id of ids) statements.push(env.DB.prepare('INSERT INTO pull_request_assignees (pull_request_id,user_id) VALUES (?,?)').bind(pull.id, id));
      for (const id of ids.filter((id) => !previous.has(id))) addEvent('assigned', { handle: memberNames.get(id) ?? id });
      for (const id of [...previous].filter((id) => !next.has(id))) addEvent('unassigned', { handle: memberNames.get(id) ?? id });
    }
  }
  if (body.labelIds !== undefined) {
    if (!Array.isArray(body.labelIds) || body.labelIds.length > 20 || body.labelIds.some((id: unknown) => typeof id !== 'string')) return problem(422, 'invalid_labels', 'Choose up to twenty repository labels.');
    const ids = [...new Set(body.labelIds as string[])];
    if (ids.some((id) => !labelNames.has(id))) return problem(422, 'invalid_labels', 'Every label must belong to this repository.');
    const previous = new Set(currentLabels.results.map((item) => item.id));
    const next = new Set(ids);
    if (ids.some((id) => !previous.has(id)) || [...previous].some((id) => !next.has(id))) {
      statements.push(env.DB.prepare('DELETE FROM pull_request_labels WHERE pull_request_id=?').bind(pull.id));
      for (const id of ids) statements.push(env.DB.prepare('INSERT INTO pull_request_labels (pull_request_id,label_id) VALUES (?,?)').bind(pull.id, id));
      for (const id of ids.filter((id) => !previous.has(id))) addEvent('label_added', { label: labelNames.get(id) ?? id });
      for (const id of [...previous].filter((id) => !next.has(id))) addEvent('label_removed', { label: labelNames.get(id) ?? id });
    }
  }
  if (body.locked !== undefined) {
    if (typeof body.locked !== 'boolean') return problem(422, 'invalid_lock_state', 'Conversation lock state must be a boolean.');
    if (body.locked !== Boolean(pull.lockedAt)) {
      statements.push(env.DB.prepare('UPDATE pull_requests SET locked_at=?,locked_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.locked ? new Date().toISOString() : null, body.locked ? principal.id : null, pull.id));
      addEvent(body.locked ? 'locked' : 'unlocked');
    }
  }
  if (!statements.length) return json({ updated: false });
  const assigneeIds = body.assigneeIds === undefined ? currentAssignees.results.map((item) => item.id) : [...new Set(body.assigneeIds as string[])];
  const labelIds = body.labelIds === undefined ? currentLabels.results.map((item) => item.id) : [...new Set(body.labelIds as string[])];
  const locked = body.locked === undefined ? Boolean(pull.lockedAt) : body.locked;
  const update = await commitPullUpdate(env, pull.id, 'metadata.updated', { metadata: { assigneeIds, labelIds, locked }, timeline: events.map((event) => ({ kind: 'event', value: event.value, createdAt: event.value.createdAt })) }, statements);
  return json({ updated: true, metadata: { assigneeIds, labelIds, locked }, update });
}

export async function addPullComment(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`SELECT id,locked_at AS lockedAt FROM pull_requests WHERE repository_id=? AND number=?`).bind(repository.id, number).first<{ id: string; lockedAt?: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  if (pull.lockedAt) return problem(423, 'conversation_locked', 'This conversation is locked.');
  const body = await readJson(request);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 50_000) return problem(422, 'invalid_pull_comment', 'A comment is required.');
  const id = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = { id, authorId: principal.id, author: principal.handle, body: body.body.trim(), createdAt, updatedAt: createdAt, deleted: false, canEdit: true };
  const update = await commitPullUpdate(env, pull.id, 'comment.created', { timeline: [{ kind: 'comment', value: comment, createdAt }] }, [
    env.DB.prepare(`INSERT INTO pull_request_comments (id,pull_request_id,author_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)`).bind(id, pull.id, principal.id, comment.body, createdAt, createdAt)
  ]);
  return json({ comment, update }, { status: 201 });
}

export async function updatePullComment(request: Request, env: Env, principal: Principal, commentId: string): Promise<Response> {
  const body = await readJson(request);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 50_000) return problem(422, 'invalid_pull_comment', 'A comment is required.');
  const comment = await env.DB.prepare('SELECT id,pull_request_id AS pullId FROM pull_request_comments WHERE id=? AND author_id=? AND deleted_at IS NULL').bind(commentId, principal.id).first<{ id: string; pullId: string }>();
  if (!comment) return problem(404, 'pull_comment_not_found', 'Editable comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: body.body.trim(), updatedAt, deleted: false };
  const update = await commitPullUpdate(env, comment.pullId, 'comment.updated', { comment: value }, [
    env.DB.prepare(`UPDATE pull_request_comments SET body=?,updated_at=? WHERE id=?`).bind(value.body, updatedAt, commentId)
  ]);
  return json({ comment: value, update });
}

export async function deletePullComment(env: Env, principal: Principal, commentId: string): Promise<Response> {
  const comment = await env.DB.prepare('SELECT id,pull_request_id AS pullId FROM pull_request_comments WHERE id=? AND author_id=? AND deleted_at IS NULL').bind(commentId, principal.id).first<{ id: string; pullId: string }>();
  if (!comment) return problem(404, 'pull_comment_not_found', 'Comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: '', updatedAt, deleted: true };
  const update = await commitPullUpdate(env, comment.pullId, 'comment.deleted', { comment: value }, [
    env.DB.prepare(`UPDATE pull_request_comments SET body='',deleted_at=?,updated_at=? WHERE id=?`).bind(updatedAt, updatedAt, commentId)
  ]);
  return json({ comment: value, update });
}

export async function getPullDiff(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(repository.visibility === 'public' || await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id,source_commit_id AS sourceCommitId,target_commit_id AS targetCommitId FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; sourceCommitId: string; targetCommitId: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const response = await fetch(`${env.GIT_GATEWAY_URL}/_sty/compare`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sty-gateway-token': env.GIT_GATEWAY_TOKEN ?? 'sty-local' }, body: JSON.stringify({ owner, repository: name, base: pull.targetCommitId, head: pull.sourceCommitId }) });
  if (!response.ok) return problem(502, 'diff_gateway_failed', 'Git gateway could not build this comparison.');
  const [diff, timelineThreads] = await Promise.all([response.json<Record<string, unknown>>(), allPullThreads(env, principal, pull.id)]);
  return json({ ...diff, threads: timelineThreads.map((item) => item.value) });
}

export async function compareBranches(env: Env, principal: Principal, owner: string, name: string, url: URL): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(repository.visibility === 'public' || await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const base = url.searchParams.get('base');
  const head = url.searchParams.get('head');
  if (!validBranchName(base) || !validBranchName(head) || base === head) return problem(422, 'invalid_comparison', 'Choose two different valid branches.');
  const branches = await env.DB.prepare('SELECT name, commit_id AS commitId FROM branches WHERE repository_id = ? AND name IN (?, ?)').bind(repository.id, base, head).all<{ name: string; commitId: string }>();
  const baseBranch = branches.results.find((branch) => branch.name === base);
  const headBranch = branches.results.find((branch) => branch.name === head);
  if (!baseBranch || !headBranch) return problem(404, 'branch_not_found', 'A comparison branch does not exist.');
  const response = await fetch(`${env.GIT_GATEWAY_URL}/_sty/compare`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sty-gateway-token': env.GIT_GATEWAY_TOKEN ?? 'sty-local' }, body: JSON.stringify({ owner, repository: name, base: baseBranch.commitId, head: headBranch.commitId }) });
  if (!response.ok) return problem(502, 'diff_gateway_failed', 'Git gateway could not build this comparison.');
  return json(await response.json());
}

export async function createThread(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`SELECT id, source_commit_id AS sourceCommitId, locked_at AS lockedAt FROM pull_requests WHERE repository_id = ? AND number = ? AND state IN ('draft','open')`).bind(repository.id, number).first<{ id: string; sourceCommitId: string; lockedAt?: string }>();
  if (!pull) return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  if (pull.lockedAt) return problem(423, 'conversation_locked', 'This conversation is locked.');
  const body = await readJson(request);
  const startSide = body?.startSide ?? body?.side;
  const startLine = body?.startLine ?? body?.line;
  if (!body || typeof body.path !== 'string' || !safeRepositoryPath(body.path) || !['old', 'new'].includes(String(body.side)) || startSide !== body.side || !Number.isInteger(body.line) || !Number.isInteger(startLine) || Number(startLine) < 1 || Number(startLine) > Number(body.line) || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 20_000) return problem(422, 'invalid_review_thread', 'Path, line range, side, and comment are required.');
  const threadId = identifier('thread'); const commentId = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = { id: commentId, authorId: principal.id, author: principal.handle, body: body.body.trim(), createdAt, updatedAt: createdAt, deleted: false, canEdit: true };
  const thread = { id: threadId, path: body.path, side: body.side, line: body.line, startSide, startLine, commitId: pull.sourceCommitId, createdAt, outdated: false, resolved: false, comments: [comment] };
  const update = await commitPullUpdate(env, pull.id, 'thread.created', { timeline: [{ kind: 'thread', value: thread, createdAt }], refreshState: true }, [
    env.DB.prepare('INSERT INTO review_threads (id, pull_request_id, path, side, line, start_side, start_line, commit_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(threadId, pull.id, body.path, body.side, body.line, startSide, startLine, pull.sourceCommitId, createdAt),
    env.DB.prepare('INSERT INTO review_comments (id, thread_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(commentId, threadId, principal.id, comment.body, createdAt, createdAt)
  ]);
  return json({ thread, update }, { status: 201 });
}

export async function resolveThread(request: Request, env: Env, principal: Principal, threadId: string): Promise<Response> {
  const thread = await env.DB.prepare(`SELECT review_threads.id,review_threads.pull_request_id AS pullId,review_threads.path,COALESCE(review_threads.start_line,review_threads.line) AS startLine,review_threads.line,review_threads.resolved_at AS resolvedAt FROM review_threads JOIN pull_requests ON pull_requests.id = review_threads.pull_request_id JOIN repositories ON repositories.id = pull_requests.repository_id JOIN organization_members ON organization_members.organization_id = repositories.organization_id WHERE review_threads.id = ? AND organization_members.user_id = ?`).bind(threadId, principal.id).first<{ id: string; pullId: string; path: string; startLine: number; line: number; resolvedAt?: string }>();
  if (!thread) return problem(404, 'review_thread_not_found', 'Review thread not found.');
  const body = await readJson(request);
  const resolved = body?.resolved !== false;
  if (resolved === Boolean(thread.resolvedAt)) return json({ resolved });
  const event = createPullEvent(env, thread.pullId, principal, resolved ? 'thread_resolved' : 'thread_reopened', { path: thread.path, lines: thread.startLine === thread.line ? String(thread.line) : `${thread.startLine}–${thread.line}` });
  const update = await commitPullUpdate(env, thread.pullId, 'thread.resolved', { thread: { id: threadId, resolved }, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [
    resolved
      ? env.DB.prepare('UPDATE review_threads SET resolved_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').bind(principal.id, threadId)
      : env.DB.prepare('UPDATE review_threads SET resolved_by = NULL, resolved_at = NULL WHERE id = ?').bind(threadId),
    event.statement
  ]);
  return json({ resolved, update });
}

export async function addThreadComment(request: Request, env: Env, principal: Principal, threadId: string): Promise<Response> {
  const thread = await env.DB.prepare(`SELECT review_threads.id,review_threads.pull_request_id AS pullId FROM review_threads JOIN pull_requests ON pull_requests.id=review_threads.pull_request_id JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organization_members ON organization_members.organization_id=repositories.organization_id WHERE review_threads.id=? AND organization_members.user_id=? AND pull_requests.state IN ('draft','open') AND pull_requests.locked_at IS NULL`).bind(threadId, principal.id).first<{ id: string; pullId: string }>();
  if (!thread) return problem(404, 'review_thread_not_found', 'Review conversation not found.');
  const body = await readJson(request);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 20_000) return problem(422, 'invalid_review_comment', 'A review comment is required.');
  const id = identifier('comment');
  const createdAt = new Date().toISOString();
  const comment = { id, authorId: principal.id, author: principal.handle, body: body.body.trim(), createdAt, updatedAt: createdAt, deleted: false, canEdit: true };
  const update = await commitPullUpdate(env, thread.pullId, 'thread.comment.created', { threadComment: { threadId, comment } }, [
    env.DB.prepare('INSERT INTO review_comments (id,thread_id,author_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id, threadId, principal.id, comment.body, createdAt, createdAt)
  ]);
  return json({ comment, update }, { status: 201 });
}

export async function updateReviewComment(request: Request, env: Env, principal: Principal, commentId: string): Promise<Response> {
  const body = await readJson(request);
  if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 20_000) return problem(422, 'invalid_review_comment', 'A review comment is required.');
  const comment = await env.DB.prepare(`SELECT review_comments.id,review_comments.thread_id AS threadId,review_threads.pull_request_id AS pullId FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id WHERE review_comments.id=? AND review_comments.author_id=? AND review_comments.deleted_at IS NULL`).bind(commentId, principal.id).first<{ id: string; threadId: string; pullId: string }>();
  if (!comment) return problem(404, 'review_comment_not_found', 'Editable review comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: body.body.trim(), updatedAt, deleted: false };
  const update = await commitPullUpdate(env, comment.pullId, 'thread.comment.updated', { threadComment: { threadId: comment.threadId, comment: value } }, [
    env.DB.prepare(`UPDATE review_comments SET body=?,updated_at=? WHERE id=?`).bind(value.body, updatedAt, commentId)
  ]);
  return json({ comment: value, update });
}

export async function deleteReviewComment(env: Env, principal: Principal, commentId: string): Promise<Response> {
  const comment = await env.DB.prepare(`SELECT review_comments.id,review_comments.thread_id AS threadId,review_threads.pull_request_id AS pullId FROM review_comments JOIN review_threads ON review_threads.id=review_comments.thread_id WHERE review_comments.id=? AND review_comments.author_id=? AND review_comments.deleted_at IS NULL`).bind(commentId, principal.id).first<{ id: string; threadId: string; pullId: string }>();
  if (!comment) return problem(404, 'review_comment_not_found', 'Review comment not found.');
  const updatedAt = new Date().toISOString();
  const value = { id: commentId, body: '', updatedAt, deleted: true };
  const update = await commitPullUpdate(env, comment.pullId, 'thread.comment.deleted', { threadComment: { threadId: comment.threadId, comment: value } }, [
    env.DB.prepare(`UPDATE review_comments SET body='',deleted_at=?,updated_at=? WHERE id=?`).bind(updatedAt, updatedAt, commentId)
  ]);
  return json({ comment: value, update });
}

export async function transitionPull(env: Env, principal: Principal, owner: string, name: string, number: number, action: 'ready' | 'close' | 'reopen'): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id=? AND pull_requests.number=?`).bind(repository.id, number).first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  if (action === 'ready') {
    if (pull.state !== 'draft') return problem(409, 'pull_request_not_draft', 'Only a draft pull request can be marked ready.');
    const event = createPullEvent(env, pull.id, principal, 'ready');
    const update = await commitPullUpdate(env, pull.id, 'pull.ready', { pull: { state: 'open' }, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [env.DB.prepare(`UPDATE pull_requests SET state='open',updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='draft'`).bind(pull.id), event.statement]);
    return json({ state: 'open', update });
  }
  if (action === 'close') {
    if (!['draft', 'open'].includes(pull.state)) return problem(409, 'pull_request_not_open', 'Only an open pull request can be closed.');
    const event = createPullEvent(env, pull.id, principal, 'closed');
    const update = await commitPullUpdate(env, pull.id, 'pull.closed', { pull: { state: 'closed' }, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [env.DB.prepare(`UPDATE pull_requests SET state='closed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND state IN ('draft','open')`).bind(pull.id), event.statement]);
    return json({ state: 'closed', update });
  }
  if (pull.state !== 'closed') return problem(409, 'pull_request_not_closed', 'Only a closed pull request can be reopened.');
  const branches = await env.DB.prepare(`SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name IN (?,?)`).bind(repository.id, pull.sourceBranch, pull.targetBranch).all<{ name: string; commitId: string }>();
  const source = branches.results.find((branch) => branch.name === pull.sourceBranch);
  const target = branches.results.find((branch) => branch.name === pull.targetBranch);
  if (!source || !target) return problem(409, 'branch_missing', 'Both pull request branches must exist before reopening.');
  const duplicate = await env.DB.prepare(`SELECT number FROM pull_requests WHERE repository_id=? AND source_branch=? AND target_branch=? AND state IN ('draft','open') AND id!=?`).bind(repository.id, pull.sourceBranch, pull.targetBranch, pull.id).first<{ number: number }>();
  if (duplicate) return problem(409, 'pull_request_exists', `Pull request #${duplicate.number} already proposes this branch.`);
  const pinned = await pinPullRefs(env, { owner, repository: name, number, sourceCommitId: source.commitId, targetCommitId: target.commitId, expectedSourceCommitId: pull.sourceCommitId, expectedTargetCommitId: pull.targetCommitId });
  if (!pinned.ok) return problem(502, 'pull_ref_sync_failed', 'Pull request commits could not be preserved while reopening.');
  const event = createPullEvent(env, pull.id, principal, 'reopened');
  const pullPatch = { state: 'open', sourceCommitId: source.commitId, targetCommitId: target.commitId };
  const update = await commitPullUpdate(env, pull.id, 'pull.reopened', { pull: pullPatch, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [env.DB.prepare(`UPDATE pull_requests SET state='open',source_commit_id=?,target_commit_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='closed'`).bind(source.commitId, target.commitId, pull.id), event.statement]);
  return json({ ...pullPatch, update });
}

export async function reviewPull(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`SELECT id, source_commit_id AS sourceCommitId, state FROM pull_requests WHERE repository_id = ? AND number = ?`).bind(repository.id, number).first<{ id: string; sourceCommitId: string; state: string }>();
  if (!pull || !['open', 'draft'].includes(pull.state)) return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  const body = await readJson(request);
  if (!body || !['commented', 'approved', 'changes_requested'].includes(String(body.state))) return problem(422, 'invalid_review', 'Review state is invalid.');
  const id = identifier('review');
  const createdAt = new Date().toISOString();
  const review = { id, authorId: principal.id, author: principal.handle, state: body.state, body: typeof body.body === 'string' ? body.body.slice(0, 20_000) : '', commitId: pull.sourceCommitId, createdAt };
  const update = await commitPullUpdate(env, pull.id, 'review.created', { timeline: [{ kind: 'review', value: review, createdAt }], refreshState: true }, [
    env.DB.prepare('INSERT INTO pull_request_reviews (id,pull_request_id,author_id,state,body,commit_id,created_at) VALUES (?,?,?,?,?,?,?)').bind(id, pull.id, principal.id, review.state, review.body, pull.sourceCommitId, createdAt)
  ]);
  return json({ review, update }, { status: 201 });
}

export async function mergePull(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await membership(env, principal, repository))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id = ? AND pull_requests.number = ?`).bind(repository.id, number).first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  if (pull.state === 'merged' && pull.mergedCommitId) return json({ merged: true, commitId: pull.mergedCommitId });
  if (pull.state !== 'open') return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  const body = await readJson(request);
  const method = body?.method ?? 'merge';
  if (!['merge', 'squash', 'rebase'].includes(String(method))) return problem(422, 'invalid_merge_method', 'Choose merge, squash, or rebase.');
  const [source, target, checks, reviews, unresolvedThreads] = await Promise.all([
    env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id = ? AND name = ?').bind(repository.id, pull.sourceBranch).first<{ commitId: string }>(),
    env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id = ? AND name = ?').bind(repository.id, pull.targetBranch).first<{ commitId: string }>(),
    env.DB.prepare('SELECT state FROM checks WHERE repository_id = ? AND commit_id = ?').bind(repository.id, pull.sourceCommitId).all<{ state: string }>(),
    env.DB.prepare(`SELECT author_id AS authorId,state,commit_id AS commitId,created_at AS createdAt FROM pull_request_reviews WHERE pull_request_id=? ORDER BY created_at`).bind(pull.id).all<{ authorId: string; state: string; commitId: string; createdAt: string }>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM review_threads WHERE pull_request_id = ? AND commit_id = ? AND resolved_at IS NULL').bind(pull.id, pull.sourceCommitId).first<{ count: number }>()
  ]);
  if (!source || !target) return problem(409, 'branch_missing', 'Source or target branch no longer exists.');
  const rule = await branchRuleFor(env, repository.id, pull.targetBranch);
  if (!rule.allowedMergeMethods.includes(method as MergeMethod)) return problem(409, 'merge_method_not_allowed', `${method} is not allowed for ${pull.targetBranch}.`);
  const checkSummary = { total: checks.results.length, passed: checks.results.filter((check) => check.state === 'success').length, failed: checks.results.filter((check) => ['failure', 'canceled'].includes(check.state)).length, running: checks.results.filter((check) => ['queued', 'running'].includes(check.state)).length };
  const requirements = mergeRequirements(pull, rule, checkSummary, reviews.results, unresolvedThreads?.count ?? 0);
  if (!requirements.ready) return problem(409, 'merge_requirements_not_met', requirements.reasons[0] ?? 'Merge requirements are not met.', { reasons: requirements.reasons });
  const gateway = await requestGatewayWrite(env, '/_sty/merge', { operationId: pull.id, method, repositoryId: repository.id, owner, repository: name, sourceBranch: pull.sourceBranch, targetBranch: pull.targetBranch, sourceCommitId: pull.sourceCommitId, targetCommitId: pull.targetCommitId, title: `${method === 'squash' ? 'Squash' : method === 'rebase' ? 'Rebase' : 'Merge'} pull request #${number}: ${pull.title}`, author: principal.handle });
  const result = await gateway.json().catch(() => null) as { commitId?: string; targetHeadId?: string; error?: string } | null;
  if (!gateway.ok || !result?.commitId) return problem(gateway.status === 409 ? 409 : 502, gateway.status === 409 ? 'merge_conflict' : 'merge_gateway_failed', result?.error ?? 'Git gateway could not merge this pull request.');
  const targetHeadId = result.targetHeadId ?? result.commitId;
  const event = createPullEvent(env, pull.id, principal, 'merged', { method: String(method), commit: result.commitId.slice(0, 7) });
  const pullPatch = { state: 'merged', mergedCommitId: result.commitId, mergeMethod: method };
  const update = await commitPullUpdate(env, pull.id, 'pull.merged', { pull: pullPatch, timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true }, [
    env.DB.prepare(`UPDATE pull_requests SET state='merged', target_commit_id=?, merged_commit_id=?,merge_method=?, merged_by=?, merged_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='open'`).bind(pull.targetCommitId, result.commitId, method, principal.id, pull.id),
    env.DB.prepare('UPDATE branches SET commit_id=?, updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND name=? AND commit_id IN (?, ?)').bind(targetHeadId, repository.id, pull.targetBranch, pull.targetCommitId, result.commitId),
    event.statement
  ]);
  return json({ merged: true, commitId: result.commitId, update });
}

async function preservePullRefs(env: Env, repository: Repo, pull: PullRow): Promise<Response | null> {
  const gateway = await pinPullRefs(env, { owner: repository.owner, repository: repository.name, number: pull.number, sourceCommitId: pull.sourceCommitId, targetCommitId: pull.targetCommitId });
  if (gateway.ok) return null;
  const result = await gateway.json().catch(() => null) as { error?: string } | null;
  return problem(gateway.status === 409 ? 409 : 502, gateway.status === 409 ? 'pull_ref_conflict' : 'pull_ref_gateway_failed', result?.error ?? 'Git gateway could not preserve the pull request commits.');
}

async function pullCommits(env: Env, repositoryId: string, sourceCommitId: string, targetCommitId: string) {
  return env.DB.prepare(`WITH RECURSIVE source_history(id) AS (SELECT ? UNION SELECT json_each.value FROM source_history JOIN commits ON commits.repository_id=? AND commits.id=source_history.id JOIN json_each(commits.parent_ids)),target_history(id) AS (SELECT ? UNION SELECT json_each.value FROM target_history JOIN commits ON commits.repository_id=? AND commits.id=target_history.id JOIN json_each(commits.parent_ids)) SELECT commits.id,substr(commits.id,1,7) AS shortId,commits.title,commits.author_name AS author,commits.authored_at AS authoredAt FROM commits JOIN source_history ON source_history.id=commits.id LEFT JOIN target_history ON target_history.id=commits.id WHERE commits.repository_id=? AND target_history.id IS NULL ORDER BY commits.authored_at`).bind(sourceCommitId, repositoryId, targetCommitId, repositoryId, repositoryId).all();
}
