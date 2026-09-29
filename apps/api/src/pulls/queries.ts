import { pullStack } from './stacks';
import { bodyExcerpt, renderBody } from '../core/markdown';
import type { Principal } from '../auth/principal';
import { branchRuleFor } from '../repositories/branch-rules';
import { commitChecks } from './merge/readiness';
import { mergeQueueStatus } from './queue/entries';
import { pullMergePermission } from './permissions';
import { pullChecksApproval } from './merge/checks';
import { pageResult, pageSize, readCursor } from '../http/cursor';
import { json, problem } from '../http/http';
import { readListQuery } from '../http/list-query';
import type { Env } from '../core/platform';
import {
  latestReviews,
  pullCommits,
  pullRepository as repo,
  pullSelect,
  pullSummary as summary,
  reviewStatusFor,
  summarizePullRows as summarizeRows,
  type PullRow
} from './context';
import { mergeRequirements } from './merge/requirements';
import { pullUpdatesAfter } from './realtime/updates';
import { initialPullTimeline, pullRevisionTimeline } from './timeline';
import { authorizeRepository, repositoryListFilter, repositoryCan } from '../repositories/access/access';
import { linkedWorkItems } from '../issues/references/work-items';

function selectedLabels(url: URL) {
  return [
    ...new Set(
      url.searchParams
        .getAll('label')
        .map((label) => label.trim())
        .filter(Boolean)
    )
  ];
}

function labelFilterSql(labels: string[]) {
  return labels.length
    ? `AND (SELECT COUNT(DISTINCT lower(repository_labels.name)) FROM pull_request_labels JOIN repository_labels ON repository_labels.id=pull_request_labels.label_id WHERE pull_request_labels.pull_request_id=pull_requests.id AND lower(repository_labels.name) IN (${labels.map(() => '?').join(',')}))=?`
    : '';
}

export async function listAllPulls(env: Env, principal: Principal, url: URL): Promise<Response> {
  const search = readListQuery(url);
  if ('error' in search) return search.error;
  const limit = pageSize(url);
  const cursor = readCursor(url);
  const access = repositoryListFilter(principal);
  const state = url.searchParams.get('state') ?? 'open';
  if (!['open', 'merged', 'closed', 'all'].includes(state))
    return problem(422, 'invalid_pull_state', 'Pull request state is invalid.');
  const labels = selectedLabels(url);
  if (labels.length > 10 || labels.some((label) => label.length > 100))
    return problem(422, 'invalid_labels', 'Choose up to ten valid labels.');
  const stateSql =
    state === 'open'
      ? "AND pull_requests.state IN ('draft','open')"
      : state === 'all'
        ? ''
        : 'AND pull_requests.state=?';
  const labelsSql = labelFilterSql(labels);
  const querySql = search.query
    ? `AND (pull_requests.title LIKE ? ESCAPE '\\' OR users.handle LIKE ? ESCAPE '\\' OR pull_requests.source_branch LIKE ? ESCAPE '\\' OR pull_requests.target_branch LIKE ? ESCAPE '\\' OR organizations.slug || '/' || repositories.name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM pull_request_labels JOIN repository_labels ON repository_labels.id=pull_request_labels.label_id WHERE pull_request_labels.pull_request_id=pull_requests.id AND repository_labels.name LIKE ? ESCAPE '\\'))`
    : '';
  const after = cursor ? 'AND (pull_requests.updated_at<? OR (pull_requests.updated_at=? AND pull_requests.id<?))' : '';
  const filters = [
    ...access.values,
    ...(state !== 'open' && state !== 'all' ? [state] : []),
    ...labels.map((label) => label.toLowerCase()),
    ...(labels.length ? [labels.length] : []),
    ...(search.query ? [search.like, search.like, search.like, search.like, search.like, search.like] : [])
  ];
  const values = cursor ? [...filters, cursor.value, cursor.value, cursor.id, limit + 1] : [...filters, limit + 1];
  const [rows, availableLabels] = await Promise.all([
    env.DB.prepare(
      `${pullSelect} WHERE ${access.sql} ${stateSql} ${labelsSql} ${querySql} ${after} ORDER BY pull_requests.updated_at DESC,pull_requests.id DESC LIMIT ?`
    )
      .bind(...values)
      .all<PullRow>(),
    env.DB.prepare(
      `SELECT repository_labels.name,repository_labels.color,repository_labels.description,COUNT(*) AS uses FROM repository_labels JOIN repositories ON repositories.id=repository_labels.repository_id WHERE ${access.sql} GROUP BY lower(repository_labels.name) ORDER BY uses DESC,repository_labels.name LIMIT 100`
    )
      .bind(...access.values)
      .all<{ name: string; color: string; description: string; uses: number }>()
  ]);
  const page = pageResult(rows.results, limit, (row) => ({ value: row.updatedAt, id: row.id }));
  return json({
    pullRequests: await summarizeRows(env, page.items),
    nextCursor: page.nextCursor,
    availableLabels: availableLabels.results
  });
}

export async function listPulls(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  url: URL
): Promise<Response> {
  const search = readListQuery(url);
  if ('error' in search) return search.error;
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read')))
    return problem(404, 'repository_not_found', 'Repository not found.');
  const limit = pageSize(url);
  const cursor = readCursor(url);
  const state = url.searchParams.get('state') ?? 'all';
  if (!['open', 'merged', 'closed', 'all'].includes(state))
    return problem(422, 'invalid_pull_state', 'Pull request state is invalid.');
  const labels = selectedLabels(url);
  if (labels.length > 10 || labels.some((label) => label.length > 100))
    return problem(422, 'invalid_labels', 'Choose up to ten valid labels.');
  const stateSql =
    state === 'open'
      ? "AND pull_requests.state IN ('draft','open')"
      : state === 'all'
        ? ''
        : 'AND pull_requests.state=?';
  const labelsSql = labelFilterSql(labels);
  const after = cursor ? 'AND (pull_requests.updated_at<? OR (pull_requests.updated_at=? AND pull_requests.id<?))' : '';
  const querySql = search.query
    ? `AND (pull_requests.title LIKE ? ESCAPE '\\' OR pull_requests.source_branch LIKE ? ESCAPE '\\' OR pull_requests.number=?)`
    : '';
  const filters = [
    repository.id,
    ...(state !== 'open' && state !== 'all' ? [state] : []),
    ...labels.map((label) => label.toLowerCase()),
    ...(labels.length ? [labels.length] : []),
    ...(search.query ? [search.like, search.like, Number(search.query.replace(/^[#!]/, '')) || -1] : [])
  ];
  const values = cursor ? [...filters, cursor.value, cursor.value, cursor.id, limit + 1] : [...filters, limit + 1];
  const [rows, availableLabels] = await Promise.all([
    env.DB.prepare(
      `${pullSelect} WHERE pull_requests.repository_id=? ${stateSql} ${labelsSql} ${querySql} ${after} ORDER BY pull_requests.updated_at DESC,pull_requests.id DESC LIMIT ?`
    )
      .bind(...values)
      .all<PullRow>(),
    env.DB.prepare('SELECT name,color,description FROM repository_labels WHERE repository_id=? ORDER BY name')
      .bind(repository.id)
      .all<{ name: string; color: string; description: string }>()
  ]);
  const page = pageResult(rows.results, limit, (row) => ({ value: row.updatedAt, id: row.id }));
  return json({
    pullRequests: await summarizeRows(env, page.items),
    nextCursor: page.nextCursor,
    availableLabels: availableLabels.results
  });
}

export async function getPull(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  number: number
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id = ? AND pull_requests.number = ?`)
    .bind(repository.id, number)
    .first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const [
    reviews,
    checks,
    unresolvedThreads,
    rule,
    commits,
    labels,
    availableLabels,
    assignees,
    availableAssignees,
    timeline,
    linkedItems,
    checksApproval,
    stack,
    viewerLastReview
  ] = await Promise.all([
    latestReviews(env, pull.id),
    env.DB.prepare(
      `SELECT checks.id,checks.name,checks.state,checks.summary,checks.details_url AS detailsUrl,checks.updated_at AS updatedAt,COALESCE(canonical_workflows.id,checks.producer_workflow_id) AS producerWorkflowId,checks.producer_job_key AS producerJobKey,(SELECT json_object('number',runs.number,'trigger',runs.trigger_name) FROM runs WHERE runs.repository_id=checks.producer_repository_id AND runs.workflow_id=checks.producer_workflow_id AND runs.commit_id=checks.commit_id ORDER BY runs.created_at DESC LIMIT 1) AS runJson FROM checks JOIN workflows AS producer_workflows ON producer_workflows.id=checks.producer_workflow_id JOIN repositories AS producer_repositories ON producer_repositories.id=checks.producer_repository_id LEFT JOIN workflows AS canonical_workflows ON canonical_workflows.repository_id=checks.producer_repository_id AND canonical_workflows.branch=producer_repositories.default_branch AND canonical_workflows.path=producer_workflows.path AND canonical_workflows.active=1 WHERE checks.repository_id=? AND checks.commit_id=? AND checks.producer_repository_id=? ORDER BY checks.name`
    )
      .bind(pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId, repository.id)
      .all<{
        name: string;
        state: string;
        producerWorkflowId: string;
        producerJobKey: string;
        runJson: string | null;
      }>(),
    env.DB.prepare(
      'SELECT COUNT(*) AS count FROM review_threads WHERE pull_request_id=? AND commit_id=? AND resolved_at IS NULL'
    )
      .bind(pull.id, pull.sourceCommitId)
      .first<{ count: number }>(),
    branchRuleFor(env, repository.id, pull.targetBranch),
    pullCommits(env, repository.id, pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId, pull.targetCommitId),
    env.DB.prepare(
      `SELECT repository_labels.id,repository_labels.name,repository_labels.color,repository_labels.description FROM repository_labels JOIN pull_request_labels ON pull_request_labels.label_id=repository_labels.id WHERE pull_request_labels.pull_request_id=? ORDER BY repository_labels.name`
    )
      .bind(pull.id)
      .all(),
    env.DB.prepare(`SELECT id,name,color,description FROM repository_labels WHERE repository_id=? ORDER BY name`)
      .bind(repository.id)
      .all(),
    env.DB.prepare(
      `SELECT users.id,users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl FROM users JOIN pull_request_assignees ON pull_request_assignees.user_id=users.id WHERE pull_request_assignees.pull_request_id=? ORDER BY users.handle`
    )
      .bind(pull.id)
      .all(),
    repository.role
      ? env.DB.prepare(
          `SELECT users.id,users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl FROM users JOIN organization_members ON organization_members.user_id=users.id WHERE organization_members.organization_id=? ORDER BY users.handle`
        )
          .bind(repository.organizationId)
          .all()
      : Promise.resolve({ results: [] }),
    initialPullTimeline(env, principal, pull.id, pull.sourceCommitId, { owner, repository: name }),
    linkedWorkItems(env, principal, 'pull', pull.id),
    pullChecksApproval(env, pull.id, repositoryCan(repository, principal, 'repository.push')),
    pullStack(env, { ...pull, repositoryId: repository.id }),
    principal
      ? env.DB.prepare(
          'SELECT commit_id AS commitId,created_at AS createdAt FROM pull_request_reviews WHERE pull_request_id=? AND author_id=? ORDER BY created_at DESC LIMIT 1'
        )
          .bind(pull.id, principal.id)
          .first<{ commitId: string; createdAt: string }>()
      : Promise.resolve(null)
  ]);
  const checkSummary = {
    total: checks.results.length,
    passed: checks.results.filter((item) => item.state === 'success').length,
    failed: checks.results.filter((item) => item.state === 'failure' || item.state === 'canceled').length,
    running: checks.results.filter((item) => item.state === 'running' || item.state === 'queued').length,
    items: checks.results.map(({ name, state, producerWorkflowId: workflowId, producerJobKey: jobKey }) => ({
      name,
      state,
      workflowId,
      jobKey
    }))
  };
  const reviewStatus = reviewStatusFor(pull, reviews.results);
  const unresolved = Number(unresolvedThreads?.count ?? 0);
  const permission = pullMergePermission(repository, principal, pull.authorId, rule);
  const requirements = mergeRequirements(pull, rule, checkSummary, reviews.results, unresolved, permission.authorMerge);
  const pullSummary = summary(pull, checkSummary, reviewStatus, unresolved);
  const mergeQueue = await mergeQueueStatus(env, pull.id, rule.mergeQueue);
  const state = pull.state === 'open' ? (requirements.ready ? 'mergeable' : 'blocked') : pullSummary.state;
  const bodyHtml = renderBody(pull.body, { owner, repository: name }, pull.id);
  return json({
    pullRequest: {
      ...pullSummary,
      state,
      body: pull.body,
      bodyHtml,
      bodyText: bodyExcerpt(bodyHtml),
      sourceCommitId: pull.sourceCommitId,
      targetCommitId: pull.targetCommitId,
      authorId: pull.authorId,
      createdAt: pull.createdAt,
      mergedCommitId: pull.mergedCommitId,
      mergeMethod: pull.mergeMethod,
      mergeRequirements: requirements,
      allowedMergeMethods: rule.allowedMergeMethods,
      commits: commits.results,
      checks: checks.results.map(({ runJson, ...check }) => ({ ...check, run: runJson ? JSON.parse(runJson) : null })),
      labels: labels.results,
      availableLabels: availableLabels.results,
      assignees: assignees.results,
      availableAssignees: availableAssignees.results,
      locked: Boolean(pull.lockedAt),
      canManage: repositoryCan(repository, principal, 'repository.triage'),
      canMerge: permission.allowed,
      checksApproval,
      mergeQueue,
      canModerate: repositoryCan(repository, principal, 'repository.maintain'),
      realtimeVersion: Number(pull.realtimeVersion),
      linkedItems,
      timeline,
      stack,
      viewerLastReview
    }
  });
}

export async function getPullTimeline(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  number: number,
  url: URL
): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read')))
    return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(
    'SELECT id,source_commit_id AS sourceCommitId FROM pull_requests WHERE repository_id=? AND number=?'
  )
    .bind(repository.id, number)
    .first<{ id: string; sourceCommitId: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const revision = url.searchParams.get('revision');
  if (revision === null)
    return json({
      timeline: await initialPullTimeline(env, principal, pull.id, pull.sourceCommitId, { owner, repository: name })
    });
  const sequence = Number(revision);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return problem(422, 'invalid_revision', 'Revision is invalid.');
  const timeline = await pullRevisionTimeline(env, principal, pull.id, sequence, { owner, repository: name });
  return timeline ? json({ timeline }) : problem(404, 'revision_not_found', 'Revision not found.');
}

export async function getPullUpdates(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  number: number,
  url: URL
): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read')))
    return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(
    'SELECT id,realtime_version AS realtimeVersion FROM pull_requests WHERE repository_id=? AND number=?'
  )
    .bind(repository.id, number)
    .first<{ id: string; realtimeVersion: number }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const after = Number(url.searchParams.get('after') ?? 0);
  if (!Number.isSafeInteger(after) || after < 0)
    return problem(422, 'invalid_realtime_cursor', 'Realtime cursor is invalid.');
  const result = await pullUpdatesAfter(env, pull.id, after);
  return json({ ...result, version: Number(pull.realtimeVersion) });
}

export async function getPullState(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  number: number
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id=? AND pull_requests.number=?`)
    .bind(repository.id, number)
    .first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const [checks, reviews, unresolvedThreads, rule, commits, linkedItems, checksApproval] = await Promise.all([
    commitChecks(env, pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId, repository.id),
    latestReviews(env, pull.id),
    env.DB.prepare(
      'SELECT COUNT(*) AS count FROM review_threads WHERE pull_request_id=? AND commit_id=? AND resolved_at IS NULL'
    )
      .bind(pull.id, pull.sourceCommitId)
      .first<{ count: number }>(),
    branchRuleFor(env, repository.id, pull.targetBranch),
    pullCommits(env, repository.id, pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId, pull.targetCommitId),
    linkedWorkItems(env, principal, 'pull', pull.id),
    pullChecksApproval(env, pull.id, repositoryCan(repository, principal, 'repository.push'))
  ]);
  const checkSummary = {
    total: checks.results.length,
    passed: checks.results.filter((item) => item.state === 'success').length,
    failed: checks.results.filter((item) => item.state === 'failure' || item.state === 'canceled').length,
    running: checks.results.filter((item) => item.state === 'running' || item.state === 'queued').length,
    items: checks.results
  };
  const mergeQueue = await mergeQueueStatus(env, pull.id, rule.mergeQueue);
  const permission = pullMergePermission(repository, principal, pull.authorId, rule);
  const requirements = mergeRequirements(
    pull,
    rule,
    checkSummary,
    reviews.results,
    Number(unresolvedThreads?.count ?? 0),
    permission.authorMerge
  );
  const pullSummary = summary(
    pull,
    checkSummary,
    reviewStatusFor(pull, reviews.results),
    Number(unresolvedThreads?.count ?? 0)
  );
  const state = pull.state === 'open' ? (requirements.ready ? 'mergeable' : 'blocked') : pullSummary.state;
  return json({
    state: {
      state,
      sourceCommitId: pull.sourceCommitId,
      targetCommitId: pull.targetCommitId,
      mergedCommitId: pull.mergedCommitId,
      mergeMethod: pull.mergeMethod,
      commits: commits.results,
      reviewStatus: pullSummary.reviewStatus,
      checkSummary,
      mergeRequirements: requirements,
      canMerge: permission.allowed,
      allowedMergeMethods: rule.allowedMergeMethods,
      checksApproval,
      mergeQueue,
      linkedItems,
      realtimeVersion: Number(pull.realtimeVersion)
    }
  });
}

export async function connectPullRealtime(
  request: Request,
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  number: number
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT id FROM pull_requests WHERE repository_id=? AND number=?')
    .bind(repository.id, number)
    .first<{ id: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  if (request.headers.get('upgrade') !== 'websocket')
    return problem(426, 'websocket_required', 'This endpoint requires a WebSocket connection.');
  return env.PULL_ROOMS.get(env.PULL_ROOMS.idFromName(pull.id)).fetch(request);
}
