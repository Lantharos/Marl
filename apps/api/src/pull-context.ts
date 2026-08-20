import type { Principal } from './auth';
import { branchRulesFor, type BranchRule, type MergeMethod } from './branch-rules';
import { identifier } from './domain';
import { pinPullRefs } from './git-writes';
import { problem } from './http';
import type { Env } from './platform';
import { mergeRequirements, type CheckCounts, type RequirementReview } from './pull-requirements';
import { authorizeRepository, lookupRepository } from './repository-access';
import { commitAuthorIdSql } from './commit-authors';

export type PullRepository = { id: string; owner: string; name: string; visibility: 'public' | 'private'; organizationId: string };
export type PullRow = { id: string; repositoryId: string; sourceRepositoryId: string | null; number: number; title: string; body: string; authorId: string; author: string; authorDisplayName: string; authorAvatarUrl: string | null; sourceBranch: string; targetBranch: string; sourceCommitId: string; targetCommitId: string; sourceOwner: string; sourceRepository: string; state: 'draft' | 'open' | 'merged' | 'closed'; mergedCommitId?: string; mergeMethod?: MergeMethod; lockedAt?: string; realtimeVersion: number; createdAt: string; updatedAt: string; owner: string; repository: string };
export type ReviewStatus = 'none' | 'requested' | 'approved' | 'changes_requested';

export const pullSelect = `SELECT pull_requests.id,pull_requests.repository_id AS repositoryId,pull_requests.source_repository_id AS sourceRepositoryId,pull_requests.number,pull_requests.title,pull_requests.body,pull_requests.author_id AS authorId,users.handle AS author,users.display_name AS authorDisplayName,users.avatar_url AS authorAvatarUrl,pull_requests.source_branch AS sourceBranch,pull_requests.target_branch AS targetBranch,pull_requests.source_commit_id AS sourceCommitId,pull_requests.target_commit_id AS targetCommitId,pull_requests.state,pull_requests.merged_commit_id AS mergedCommitId,pull_requests.merge_method AS mergeMethod,pull_requests.locked_at AS lockedAt,pull_requests.realtime_version AS realtimeVersion,pull_requests.created_at AS createdAt,pull_requests.updated_at AS updatedAt,organizations.slug AS owner,repositories.name AS repository,COALESCE(source_organizations.slug,organizations.slug) AS sourceOwner,COALESCE(source_repositories.name,repositories.name) AS sourceRepository FROM pull_requests JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id JOIN users ON users.id=pull_requests.author_id LEFT JOIN repositories AS source_repositories ON source_repositories.id=pull_requests.source_repository_id LEFT JOIN organizations AS source_organizations ON source_organizations.id=source_repositories.organization_id`;

export function createPullEvent(env: Env, pullId: string, actor: Pick<Principal, 'id' | 'handle' | 'displayName'>, kind: string, details: Record<string, string> = {}) {
  const id = identifier('event');
  const createdAt = new Date().toISOString();
  return {
    statement: env.DB.prepare('INSERT INTO pull_request_events (id,pull_request_id,actor_id,kind,details,created_at) VALUES (?,?,?,?,?,?)').bind(id, pullId, actor.id, kind, JSON.stringify(details), createdAt),
    value: { id, actor: actor.handle, actorDisplayName: actor.displayName, kind, details, createdAt }
  };
}

export async function pullRepository(env: Env, owner: string, name: string): Promise<PullRepository | null> {
  const repository = await lookupRepository(env, owner, name);
  return repository ? { id: repository.id, owner: repository.owner, name: repository.name, visibility: repository.visibility, organizationId: repository.organizationId } : null;
}

export async function canManageRepository(env: Env, principal: Principal, repository: PullRepository): Promise<boolean> {
  return Boolean(await authorizeRepository(env, principal, repository.owner, repository.name, 'repository.triage'));
}

export function reviewStatusFor(pull: PullRow, rule: BranchRule, reviews: RequirementReview[]): ReviewStatus {
  const latest = new Map<string, string>();
  for (const review of reviews) if (!rule.dismissStaleReviews || review.commitId === pull.sourceCommitId) latest.set(review.authorId, review.state);
  const states = [...latest.values()];
  return states.includes('changes_requested') ? 'changes_requested' : states.includes('approved') ? 'approved' : pull.state === 'open' ? 'requested' : 'none';
}

export function latestReviews(env: Env, pullId: string) {
  return env.DB.prepare(`SELECT authorId,state,commitId FROM (SELECT author_id AS authorId,state,commit_id AS commitId,created_at AS createdAt,ROW_NUMBER() OVER (PARTITION BY author_id,commit_id ORDER BY created_at DESC,id DESC) AS rank FROM pull_request_reviews WHERE pull_request_id=?) WHERE rank=1 ORDER BY createdAt`).bind(pullId).all<RequirementReview>();
}

export function pullSummary(row: PullRow, checks: CheckCounts = { total: 0, passed: 0, failed: 0, running: 0 }, reviewStatus: ReviewStatus = 'none', unresolved = 0, labels: Array<{ id: string; name: string; color: string; description: string }> = []) {
  const blocked = checks.failed > 0 || reviewStatus === 'changes_requested' || unresolved > 0;
  const state = row.state === 'open' ? (blocked ? 'blocked' : checks.running === 0 ? 'mergeable' : 'open') : row.state;
  return { id: row.id, number: row.number, repository: { owner: row.owner, name: row.repository }, title: row.title, author: row.author, authorDisplayName: row.authorDisplayName, authorAvatar: row.authorAvatarUrl, sourceRepository: { owner: row.sourceOwner, name: row.sourceRepository }, sourceBranch: row.sourceBranch, targetBranch: row.targetBranch, state, reviewStatus, labels, checkSummary: checks, updatedAt: row.updatedAt };
}

export async function summarizePullRows(env: Env, rows: PullRow[]) {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => '?').join(',');
  const ids = rows.map((row) => row.id);
  const [checkRows, reviewRows, threadRows, labelRows, rules] = await Promise.all([
    env.DB.prepare(`SELECT pull_requests.id AS pullId,checks.name,checks.state FROM pull_requests LEFT JOIN checks ON checks.repository_id=COALESCE(pull_requests.source_repository_id,pull_requests.repository_id) AND checks.commit_id=pull_requests.source_commit_id WHERE pull_requests.id IN (${placeholders})`).bind(...ids).all<{ pullId: string; name: string | null; state: string | null }>(),
    env.DB.prepare(`SELECT pullId,authorId,state,commitId FROM (SELECT pull_request_id AS pullId,author_id AS authorId,state,commit_id AS commitId,created_at AS createdAt,ROW_NUMBER() OVER (PARTITION BY pull_request_id,author_id,commit_id ORDER BY created_at DESC,id DESC) AS rank FROM pull_request_reviews WHERE pull_request_id IN (${placeholders})) WHERE rank=1 ORDER BY createdAt`).bind(...ids).all<{ pullId: string; authorId: string; state: 'commented' | 'approved' | 'changes_requested'; commitId: string }>(),
    env.DB.prepare(`SELECT review_threads.pull_request_id AS pullId, COUNT(*) AS unresolved FROM review_threads JOIN pull_requests ON pull_requests.id = review_threads.pull_request_id AND pull_requests.source_commit_id = review_threads.commit_id WHERE review_threads.pull_request_id IN (${placeholders}) AND review_threads.resolved_at IS NULL GROUP BY review_threads.pull_request_id`).bind(...ids).all<{ pullId: string; unresolved: number }>(),
    env.DB.prepare(`SELECT pull_request_labels.pull_request_id AS pullId,repository_labels.id,repository_labels.name,repository_labels.color,repository_labels.description FROM pull_request_labels JOIN repository_labels ON repository_labels.id=pull_request_labels.label_id WHERE pull_request_labels.pull_request_id IN (${placeholders}) ORDER BY repository_labels.name`).bind(...ids).all<{ pullId: string; id: string; name: string; color: string; description: string }>(),
    branchRulesFor(env, rows.map((row) => ({ repositoryId: row.repositoryId, branch: row.targetBranch })))
  ]);
  const checks = new Map<string, CheckCounts>();
  for (const row of checkRows.results) {
    const counts = checks.get(row.pullId) ?? { total: 0, passed: 0, failed: 0, running: 0, items: [] };
    if (row.name && row.state) {
      counts.total += 1;
      if (row.state === 'success') counts.passed += 1;
      else if (row.state === 'failure' || row.state === 'canceled') counts.failed += 1;
      else counts.running += 1;
      counts.items!.push({ name: row.name, state: row.state });
    }
    checks.set(row.pullId, counts);
  }
  const reviews = new Map<string, Array<{ authorId: string; state: string; commitId: string }>>();
  for (const review of reviewRows.results) {
    const items = reviews.get(review.pullId) ?? [];
    items.push(review);
    reviews.set(review.pullId, items);
  }
  const threads = new Map(threadRows.results.map((item) => [item.pullId, Number(item.unresolved)]));
  const labels = new Map<string, Array<{ id: string; name: string; color: string; description: string }>>();
  for (const label of labelRows.results) {
    const items = labels.get(label.pullId) ?? [];
    items.push({ id: label.id, name: label.name, color: label.color, description: label.description });
    labels.set(label.pullId, items);
  }
  return rows.map((row) => {
    const rule = rules.get(`${row.repositoryId}:${row.targetBranch}`) ?? { pattern: row.targetBranch, requiredApprovals: 0, requiredChecks: [], requireConversations: true, dismissStaleReviews: true, allowedMergeMethods: ['merge', 'squash', 'rebase'] as MergeMethod[] };
    const rowReviews = reviews.get(row.id) ?? [];
    const reviewStatus = reviewStatusFor(row, rule, rowReviews);
    const counts = checks.get(row.id) ?? { total: 0, passed: 0, failed: 0, running: 0 };
    const unresolved = threads.get(row.id) ?? 0;
    const value = pullSummary(row, counts, reviewStatus, unresolved, labels.get(row.id) ?? []);
    const requirements = mergeRequirements(row, rule, counts, rowReviews, unresolved);
    return row.state === 'open' ? { ...value, state: requirements.ready ? 'mergeable' : 'blocked' } : value;
  });
}

export async function preservePullRefs(env: Env, repository: PullRepository, pull: PullRow): Promise<Response | null> {
  const gateway = await pinPullRefs(env, { owner: repository.owner, repository: repository.name, number: pull.number, sourceCommitId: pull.sourceCommitId, targetCommitId: pull.targetCommitId, ...(pull.sourceRepositoryId ? { sourceOwner: pull.sourceOwner, sourceRepository: pull.sourceRepository, sourceRepositoryId: pull.sourceRepositoryId } : {}) });
  if (gateway.ok) return null;
  const result = await gateway.json().catch(() => null) as { error?: string } | null;
  return problem(gateway.status === 409 ? 409 : 502, gateway.status === 409 ? 'pull_ref_conflict' : 'pull_ref_gateway_failed', result?.error ?? 'Git gateway could not preserve the pull request commits.');
}

export function pullCommits(env: Env, repositoryId: string, sourceRepositoryId: string, sourceCommitId: string, targetCommitId: string) {
  return env.DB.prepare(`WITH RECURSIVE source_history(id) AS (SELECT ? UNION SELECT json_each.value FROM source_history JOIN commits ON commits.repository_id=? AND commits.id=source_history.id JOIN json_each(commits.parent_ids)),target_history(id) AS (SELECT ? UNION SELECT json_each.value FROM target_history JOIN commits ON commits.repository_id=? AND commits.id=target_history.id JOIN json_each(commits.parent_ids)),commit_rows AS (SELECT commits.*,${commitAuthorIdSql()} AS matched_author_id FROM commits) SELECT commit_rows.id,substr(commit_rows.id,1,7) AS shortId,commit_rows.title,commit_rows.author_name AS author,commit_authors.handle AS authorHandle,commit_authors.display_name AS authorDisplayName,commit_authors.avatar_url AS authorAvatarUrl,commit_rows.authored_at AS authoredAt,commit_rows.signature_status AS signatureStatus FROM commit_rows JOIN source_history ON source_history.id=commit_rows.id LEFT JOIN target_history ON target_history.id=commit_rows.id LEFT JOIN users AS commit_authors ON commit_authors.id=commit_rows.matched_author_id WHERE commit_rows.repository_id=? AND target_history.id IS NULL ORDER BY commit_rows.authored_at,commit_rows.id`).bind(sourceCommitId, sourceRepositoryId, targetCommitId, repositoryId, sourceRepositoryId).all<{ id: string; shortId: string; title: string; author: string; authorHandle: string | null; authorDisplayName: string | null; authorAvatarUrl: string | null; authoredAt: string; signatureStatus: string }>();
}
