import type { Principal } from '../../auth/principal';
import { auditStatement } from '../../core/audit';
import { branchRuleFor, type MergeMethod } from '../../repositories/branch-rules';
import { requestGatewayWrite } from '../../git/writes';
import { json, problem, readJson } from '../../http/http';
import type { Env } from '../../core/platform';
import { createPullEvent, pullSelect, type PullRow } from '../context';
import { mergeRequirements } from './requirements';
import { commitPullUpdate } from '../realtime/updates';
import { queuePullWorkflows } from './checks';
import { pullMergePermission } from '../permissions';
import { mergeBody } from '../../http/request-schemas';
import { authorizeRepository } from '../../repositories/access/access';
import { closingIssueStatements } from '../../issues/references/work-items';

export async function mergePull(
  request: Request,
  env: Env,
  principal: Principal,
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
  const rule = await branchRuleFor(env, repository.id, pull.targetBranch);
  const permission = pullMergePermission(repository, principal, pull.authorId, rule);
  if (!permission.allowed) return problem(403, 'merge_not_allowed', 'You do not have permission to merge this pull.');
  if (pull.state === 'merged' && pull.mergedCommitId) return json({ merged: true, commitId: pull.mergedCommitId });
  if (pull.state !== 'open') return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  const body = await readJson(request, mergeBody);
  if (!body || body.commitId !== pull.sourceCommitId)
    return problem(409, 'pull_head_changed', 'The pull changed. Check the latest revision before merging.');
  const method = body?.method ?? 'merge';
  if (!['merge', 'squash', 'rebase'].includes(String(method)))
    return problem(422, 'invalid_merge_method', 'Choose merge, squash, or rebase.');
  if (permission.authorMerge) await queuePullWorkflows(env, pull.id);
  const [source, target, checks, reviews, unresolvedThreads] = await Promise.all([
    env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id = ? AND name = ?')
      .bind(pull.sourceRepositoryId ?? repository.id, pull.sourceBranch)
      .first<{ commitId: string }>(),
    env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id = ? AND name = ?')
      .bind(repository.id, pull.targetBranch)
      .first<{ commitId: string }>(),
    env.DB.prepare(
      'SELECT checks.name,checks.state,COALESCE(canonical_workflows.id,checks.producer_workflow_id) AS workflowId,checks.producer_job_key AS jobKey FROM checks JOIN workflows AS producer_workflows ON producer_workflows.id=checks.producer_workflow_id JOIN repositories AS producer_repositories ON producer_repositories.id=checks.producer_repository_id LEFT JOIN workflows AS canonical_workflows ON canonical_workflows.repository_id=checks.producer_repository_id AND canonical_workflows.branch=producer_repositories.default_branch AND canonical_workflows.path=producer_workflows.path AND canonical_workflows.active=1 WHERE checks.repository_id=? AND checks.commit_id=? AND checks.producer_repository_id=?'
    )
      .bind(pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId, repository.id)
      .all<{ name: string; state: string; workflowId: string; jobKey: string }>(),
    env.DB.prepare(
      `SELECT author_id AS authorId,state,commit_id AS commitId,created_at AS createdAt FROM pull_request_reviews WHERE pull_request_id=? ORDER BY created_at,id`
    )
      .bind(pull.id)
      .all<{ authorId: string; state: string; commitId: string; createdAt: string }>(),
    env.DB.prepare(
      'SELECT COUNT(*) AS count FROM review_threads WHERE pull_request_id = ? AND commit_id = ? AND resolved_at IS NULL'
    )
      .bind(pull.id, pull.sourceCommitId)
      .first<{ count: number }>()
  ]);
  if (!source || !target) return problem(409, 'branch_missing', 'Source or target branch no longer exists.');
  if (source.commitId !== pull.sourceCommitId || target.commitId !== pull.targetCommitId)
    return problem(409, 'pull_head_changed', 'The branches changed. Wait for the pull to update before merging.');
  if (!rule.allowedMergeMethods.includes(method as MergeMethod))
    return problem(409, 'merge_method_not_allowed', `${method} is not allowed for ${pull.targetBranch}.`);
  const checkSummary = {
    total: checks.results.length,
    passed: checks.results.filter((check) => check.state === 'success').length,
    failed: checks.results.filter((check) => ['failure', 'canceled'].includes(check.state)).length,
    running: checks.results.filter((check) => ['queued', 'running'].includes(check.state)).length,
    items: checks.results
  };
  const requirements = mergeRequirements(
    pull,
    rule,
    checkSummary,
    reviews.results,
    unresolvedThreads?.count ?? 0,
    permission.authorMerge
  );
  if (!requirements.ready)
    return problem(409, 'merge_requirements_not_met', requirements.reasons[0] ?? 'Merge requirements are not met.', {
      reasons: requirements.reasons
    });
  const signing = await env.DB.prepare(
    'SELECT users.signing_mode AS personalMode,repositories.signing_mode AS repositoryMode FROM users,repositories WHERE users.id=? AND repositories.id=?'
  )
    .bind(principal.id, repository.id)
    .first<{ personalMode: string; repositoryMode: string }>();
  if (signing?.personalMode === 'firewall' || signing?.repositoryMode === 'firewall')
    return problem(
      409,
      'signing_required',
      'The signing firewall requires a signed commit. Create and sign the merge locally, then push it.'
    );
  const authorEmail =
    (
      await env.DB.prepare(
        'SELECT email FROM user_emails WHERE user_id=? AND verified_at IS NOT NULL ORDER BY primary_email DESC,created_at LIMIT 1'
      )
        .bind(principal.id)
        .first<{ email: string }>()
    )?.email ?? `${principal.handle}@users.marl.sh`;
  const gateway = await requestGatewayWrite(env, '/_marl/merge', {
    operationId: pull.id,
    method,
    repositoryId: repository.id,
    owner,
    repository: name,
    sourceBranch: pull.sourceBranch,
    targetBranch: pull.targetBranch,
    sourceCommitId: pull.sourceCommitId,
    targetCommitId: pull.targetCommitId,
    title: `${method === 'squash' ? 'Squash' : method === 'rebase' ? 'Rebase' : 'Merge'} pull request !${number}: ${pull.title}`,
    author: principal.handle,
    authorEmail,
    actorId: principal.id
  });
  const result = (await gateway.json().catch(() => null)) as {
    commitId?: string;
    targetHeadId?: string;
    error?: string;
  } | null;
  if (!gateway.ok || !result?.commitId)
    return problem(
      gateway.status === 409 ? 409 : 502,
      gateway.status === 409 ? 'merge_conflict' : 'merge_gateway_failed',
      result?.error ?? 'Git gateway could not merge this pull request.'
    );
  const targetHeadId = result.targetHeadId ?? result.commitId;
  const event = createPullEvent(env, pull.id, principal, 'merged', {
    method: String(method),
    commit: result.commitId.slice(0, 7)
  });
  const closing =
    pull.targetBranch === repository.defaultBranch
      ? await closingIssueStatements(env, pull.id, principal, { owner, repository: name, number })
      : { statements: [], issueIds: [] };
  const pullPatch = { state: 'merged', mergedCommitId: result.commitId, mergeMethod: method };
  const update = await commitPullUpdate(
    env,
    pull.id,
    'pull.merged',
    {
      pull: pullPatch,
      closedIssueIds: closing.issueIds,
      timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }],
      refreshState: true
    },
    [
      env.DB.prepare(
        `UPDATE pull_requests SET state='merged', target_commit_id=?, merged_commit_id=?,merge_method=?, merged_by=?, merged_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='open'`
      ).bind(pull.targetCommitId, result.commitId, method, principal.id, pull.id),
      env.DB.prepare(
        'UPDATE branches SET commit_id=?, updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND name=? AND commit_id IN (?, ?)'
      ).bind(targetHeadId, repository.id, pull.targetBranch, pull.targetCommitId, result.commitId),
      event.statement,
      ...closing.statements,
      auditStatement(env, {
        organizationId: repository.organizationId,
        repositoryId: repository.id,
        actor: principal,
        action: 'pull.merged',
        subjectType: 'pull_request',
        subjectId: pull.id,
        details: { number, method, commitId: result.commitId, targetBranch: pull.targetBranch }
      })
    ]
  );
  return json({ merged: true, commitId: result.commitId, update });
}
