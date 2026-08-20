import type { Principal } from './auth';
import { branchRuleFor } from './branch-rules';
import { pageResult, pageSize, readCursor } from './cursor';
import { safeRepositoryPath, validBranchName } from './domain';
import { requestGitGateway } from './git-gateway';
import { json, problem } from './http';
import { readListQuery } from './list-query';
import type { Env } from './platform';
import { canManageRepository as membership, latestReviews, preservePullRefs, pullCommits, pullRepository as repo, pullSelect, pullSummary as summary, reviewStatusFor, summarizePullRows as summarizeRows, type PullRow } from './pull-context';
import { mergeRequirements } from './pull-requirements';
import { pullUpdatesAfter } from './pull-realtime';
import { allPullThreads, initialPullTimeline, olderPullTimeline } from './pull-timeline';
import { authorizeRepository, repositoryListFilter } from './repository-access';

function selectedLabels(url: URL) {
  return [...new Set(url.searchParams.getAll('label').map((label) => label.trim()).filter(Boolean))];
}

function labelFilterSql(labels: string[]) {
  return labels.length ? `AND (SELECT COUNT(DISTINCT lower(repository_labels.name)) FROM pull_request_labels JOIN repository_labels ON repository_labels.id=pull_request_labels.label_id WHERE pull_request_labels.pull_request_id=pull_requests.id AND lower(repository_labels.name) IN (${labels.map(() => '?').join(',')}))=?` : '';
}

export async function listAllPulls(env: Env, principal: Principal, url: URL): Promise<Response> {
  const search = readListQuery(url);
  if ('error' in search) return search.error;
  const limit = pageSize(url);
  const cursor = readCursor(url);
  const access = repositoryListFilter(principal);
  const state = url.searchParams.get('state') ?? 'open';
  if (!['open', 'merged', 'closed', 'all'].includes(state)) return problem(422, 'invalid_pull_state', 'Pull request state is invalid.');
  const labels = selectedLabels(url);
  if (labels.length > 10 || labels.some((label) => label.length > 100)) return problem(422, 'invalid_labels', 'Choose up to ten valid labels.');
  const stateSql = state === 'open' ? "AND pull_requests.state IN ('draft','open')" : state === 'all' ? '' : 'AND pull_requests.state=?';
  const labelsSql = labelFilterSql(labels);
  const querySql = search.query ? `AND (pull_requests.title LIKE ? ESCAPE '\\' OR users.handle LIKE ? ESCAPE '\\' OR pull_requests.source_branch LIKE ? ESCAPE '\\' OR pull_requests.target_branch LIKE ? ESCAPE '\\' OR organizations.slug || '/' || repositories.name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM pull_request_labels JOIN repository_labels ON repository_labels.id=pull_request_labels.label_id WHERE pull_request_labels.pull_request_id=pull_requests.id AND repository_labels.name LIKE ? ESCAPE '\\'))` : '';
  const after = cursor ? 'AND (pull_requests.updated_at<? OR (pull_requests.updated_at=? AND pull_requests.id<?))' : '';
  const filters = [...access.values, ...(state !== 'open' && state !== 'all' ? [state] : []), ...labels.map((label) => label.toLowerCase()), ...(labels.length ? [labels.length] : []), ...(search.query ? [search.like, search.like, search.like, search.like, search.like, search.like] : [])];
  const values = cursor ? [...filters, cursor.value, cursor.value, cursor.id, limit + 1] : [...filters, limit + 1];
  const [rows, availableLabels] = await Promise.all([
    env.DB.prepare(`${pullSelect} WHERE ${access.sql} ${stateSql} ${labelsSql} ${querySql} ${after} ORDER BY pull_requests.updated_at DESC,pull_requests.id DESC LIMIT ?`).bind(...values).all<PullRow>(),
    env.DB.prepare(`SELECT repository_labels.name,repository_labels.color,repository_labels.description,COUNT(*) AS uses FROM repository_labels JOIN repositories ON repositories.id=repository_labels.repository_id WHERE ${access.sql} GROUP BY lower(repository_labels.name) ORDER BY uses DESC,repository_labels.name LIMIT 100`).bind(...access.values).all<{ name: string; color: string; description: string; uses: number }>()
  ]);
  const page = pageResult(rows.results, limit, (row) => ({ value: row.updatedAt, id: row.id }));
  return json({ pullRequests: await summarizeRows(env, page.items), nextCursor: page.nextCursor, availableLabels: availableLabels.results });
}

export async function listPulls(env: Env, principal: Principal, owner: string, name: string, url: URL): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const limit = pageSize(url);
  const cursor = readCursor(url);
  const state = url.searchParams.get('state') ?? 'all';
  if (!['open', 'merged', 'closed', 'all'].includes(state)) return problem(422, 'invalid_pull_state', 'Pull request state is invalid.');
  const labels = selectedLabels(url);
  if (labels.length > 10 || labels.some((label) => label.length > 100)) return problem(422, 'invalid_labels', 'Choose up to ten valid labels.');
  const stateSql = state === 'open' ? "AND pull_requests.state IN ('draft','open')" : state === 'all' ? '' : 'AND pull_requests.state=?';
  const labelsSql = labelFilterSql(labels);
  const after = cursor ? 'AND (pull_requests.updated_at<? OR (pull_requests.updated_at=? AND pull_requests.id<?))' : '';
  const filters = [repository.id, ...(state !== 'open' && state !== 'all' ? [state] : []), ...labels.map((label) => label.toLowerCase()), ...(labels.length ? [labels.length] : [])];
  const values = cursor ? [...filters, cursor.value, cursor.value, cursor.id, limit + 1] : [...filters, limit + 1];
  const [rows, availableLabels] = await Promise.all([
    env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id=? ${stateSql} ${labelsSql} ${after} ORDER BY pull_requests.updated_at DESC,pull_requests.id DESC LIMIT ?`).bind(...values).all<PullRow>(),
    env.DB.prepare('SELECT name,color,description FROM repository_labels WHERE repository_id=? ORDER BY name').bind(repository.id).all<{ name: string; color: string; description: string }>()
  ]);
  const page = pageResult(rows.results, limit, (row) => ({ value: row.updatedAt, id: row.id }));
  return json({ pullRequests: await summarizeRows(env, page.items), nextCursor: page.nextCursor, availableLabels: availableLabels.results });
}


export async function getPull(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id = ? AND pull_requests.number = ?`).bind(repository.id, number).first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const [reviews, checks, unresolvedThreads, rule, commits, labels, availableLabels, assignees, availableAssignees, timeline] = await Promise.all([
    latestReviews(env, pull.id),
    env.DB.prepare(`SELECT id, name, state, summary, details_url AS detailsUrl, updated_at AS updatedAt FROM checks WHERE repository_id = ? AND commit_id = ? ORDER BY name`).bind(pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId).all<{ name: string; state: string }>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM review_threads WHERE pull_request_id=? AND commit_id=? AND resolved_at IS NULL').bind(pull.id, pull.sourceCommitId).first<{ count: number }>(),
    branchRuleFor(env, repository.id, pull.targetBranch),
    pullCommits(env, repository.id, pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId, pull.targetCommitId),
    env.DB.prepare(`SELECT repository_labels.id,repository_labels.name,repository_labels.color,repository_labels.description FROM repository_labels JOIN pull_request_labels ON pull_request_labels.label_id=repository_labels.id WHERE pull_request_labels.pull_request_id=? ORDER BY repository_labels.name`).bind(pull.id).all(),
    env.DB.prepare(`SELECT id,name,color,description FROM repository_labels WHERE repository_id=? ORDER BY name`).bind(repository.id).all(),
    env.DB.prepare(`SELECT users.id,users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl FROM users JOIN pull_request_assignees ON pull_request_assignees.user_id=users.id WHERE pull_request_assignees.pull_request_id=? ORDER BY users.handle`).bind(pull.id).all(),
    env.DB.prepare(`SELECT users.id,users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl FROM users JOIN organization_members ON organization_members.user_id=users.id WHERE organization_members.organization_id=? ORDER BY users.handle`).bind(repository.organizationId).all(),
    initialPullTimeline(env, principal, pull.id)
  ]);
  const checkSummary = { total: checks.results.length, passed: checks.results.filter((item) => item.state === 'success').length, failed: checks.results.filter((item) => item.state === 'failure' || item.state === 'canceled').length, running: checks.results.filter((item) => item.state === 'running' || item.state === 'queued').length, items: checks.results.map(({ name: checkName, state: checkState }) => ({ name: checkName, state: checkState })) };
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
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const before = Number(url.searchParams.get('before'));
  const after = Number(url.searchParams.get('after'));
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || before <= after) return problem(422, 'invalid_timeline_cursor', 'Timeline cursors are invalid.');
  return json({ timeline: await olderPullTimeline(env, principal, pull.id, before, after) });
}

export async function getPullUpdates(env: Env, principal: Principal, owner: string, name: string, number: number, url: URL): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id,realtime_version AS realtimeVersion FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; realtimeVersion: number }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const after = Number(url.searchParams.get('after') ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return problem(422, 'invalid_realtime_cursor', 'Realtime cursor is invalid.');
  const result = await pullUpdatesAfter(env, pull.id, after);
  return json({ ...result, version: Number(pull.realtimeVersion) });
}

export async function getPullState(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id=? AND pull_requests.number=?`).bind(repository.id, number).first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const [checks, reviews, unresolvedThreads, rule, commits] = await Promise.all([
    env.DB.prepare('SELECT name,state FROM checks WHERE repository_id=? AND commit_id=?').bind(pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId).all<{ name: string; state: string }>(),
    latestReviews(env, pull.id),
    env.DB.prepare('SELECT COUNT(*) AS count FROM review_threads WHERE pull_request_id=? AND commit_id=? AND resolved_at IS NULL').bind(pull.id, pull.sourceCommitId).first<{ count: number }>(),
    branchRuleFor(env, repository.id, pull.targetBranch),
    pullCommits(env, repository.id, pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId, pull.targetCommitId)
  ]);
  const checkSummary = { total: checks.results.length, passed: checks.results.filter((item) => item.state === 'success').length, failed: checks.results.filter((item) => item.state === 'failure' || item.state === 'canceled').length, running: checks.results.filter((item) => item.state === 'running' || item.state === 'queued').length, items: checks.results };
  const requirements = mergeRequirements(pull, rule, checkSummary, reviews.results, Number(unresolvedThreads?.count ?? 0));
  const pullSummary = summary(pull, checkSummary, reviewStatusFor(pull, rule, reviews.results), Number(unresolvedThreads?.count ?? 0));
  const state = pull.state === 'open' ? (requirements.ready ? 'mergeable' : 'blocked') : pullSummary.state;
  return json({ state: { state, sourceCommitId: pull.sourceCommitId, targetCommitId: pull.targetCommitId, mergedCommitId: pull.mergedCommitId, mergeMethod: pull.mergeMethod, commits: commits.results, checkSummary, mergeRequirements: requirements, realtimeVersion: Number(pull.realtimeVersion) } });
}

export async function connectPullRealtime(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  if (request.headers.get('upgrade') !== 'websocket') return problem(426, 'websocket_required', 'This endpoint requires a WebSocket connection.');
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  return env.PULL_ROOMS.get(env.PULL_ROOMS.idFromName(pull.id)).fetch(request);
}

export async function getPullDiff(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id,source_commit_id AS sourceCommitId,target_commit_id AS targetCommitId FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ id: string; sourceCommitId: string; targetCommitId: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const response = await requestGitGateway(env, '/_marl/compare', { owner, repository: name, base: pull.targetCommitId, head: pull.sourceCommitId }, { attempts: 2 });
  if (!response.ok) return problem(502, 'diff_gateway_failed', 'Git gateway could not build this comparison.');
  const [diff, timelineThreads] = await Promise.all([response.json<Record<string, unknown>>(), allPullThreads(env, principal, pull.id)]);
  return json({ ...diff, threads: timelineThreads.map((item) => item.value) });
}

export async function getPullPatch(env: Env, principal: Principal, owner: string, name: string, number: number, url: URL): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const path = url.searchParams.get('path') ?? '';
  if (!safeRepositoryPath(path)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  const pull = await env.DB.prepare('SELECT source_commit_id AS sourceCommitId,target_commit_id AS targetCommitId FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ sourceCommitId: string; targetCommitId: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const response = await requestGitGateway(env, '/_marl/patch', { owner, repository: name, base: pull.targetCommitId, head: pull.sourceCommitId, path }, { attempts: 2 }).catch(() => null);
  if (!response?.ok) return problem(502, 'patch_gateway_failed', 'Git gateway could not read this file diff.');
  return new Response(response.body, { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
}

export async function compareBranches(env: Env, principal: Principal, owner: string, name: string, url: URL): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const base = url.searchParams.get('base');
  const head = url.searchParams.get('head');
  const sourceParts = (url.searchParams.get('sourceRepository') ?? `${owner}/${name}`).split('/');
  if (!validBranchName(base) || !validBranchName(head) || sourceParts.length !== 2) return problem(422, 'invalid_comparison', 'Choose valid repositories and branches.');
  const sourceRepository = await repo(env, sourceParts[0], sourceParts[1]);
  if (!sourceRepository || !(await authorizeRepository(env, principal, sourceParts[0], sourceParts[1], 'repository.read'))) return problem(404, 'repository_not_found', 'Source repository not found.');
  if ((await comparisonRoot(env, sourceRepository.id)) !== (await comparisonRoot(env, repository.id))) return problem(422, 'unrelated_repositories', 'These repositories are not in the same fork network.');
  if (sourceRepository.id === repository.id && base === head) return problem(422, 'invalid_comparison', 'Choose two different branches.');
  const [baseBranch, headBranch] = await Promise.all([
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?').bind(repository.id, base).first<{ name: string; commitId: string }>(),
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?').bind(sourceRepository.id, head).first<{ name: string; commitId: string }>()
  ]);
  if (!baseBranch || !headBranch) return problem(404, 'branch_not_found', 'A comparison branch does not exist.');
  const response = await requestGitGateway(env, '/_marl/compare', { owner, repository: name, base: baseBranch.commitId, head: headBranch.commitId, ...(sourceRepository.id === repository.id ? {} : { sourceOwner: sourceParts[0], sourceRepository: sourceParts[1], sourceRepositoryId: sourceRepository.id }) }, { attempts: 2 });
  if (!response.ok) return problem(502, 'diff_gateway_failed', 'Git gateway could not build this comparison.');
  return json(await response.json());
}

async function comparisonRoot(env: Env, repositoryId: string) {
  return (await env.DB.prepare('SELECT COALESCE(fork_root_repository_id,id) AS rootId FROM repositories WHERE id=?').bind(repositoryId).first<{ rootId: string }>())?.rootId ?? '';
}
