import type { Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';
import { problem } from '../../http/http';
import type { RepositoryAccess } from '../../repositories/access/access';
import type { BranchRule, MergeMethod } from '../../repositories/branch-rules';
import { detachedSource, type PullRow } from '../context';
import { queuePullWorkflows } from './checks';
import { mergeRequirements } from './requirements';

export async function commitChecks(
  env: Env,
  checkoutRepositoryId: string,
  commitId: string,
  producerRepositoryId: string
) {
  return env.DB.prepare(
    'SELECT checks.name,checks.state,COALESCE(canonical_workflows.id,checks.producer_workflow_id) AS workflowId,checks.producer_job_key AS jobKey FROM checks JOIN workflows AS producer_workflows ON producer_workflows.id=checks.producer_workflow_id JOIN repositories AS producer_repositories ON producer_repositories.id=checks.producer_repository_id LEFT JOIN workflows AS canonical_workflows ON canonical_workflows.repository_id=checks.producer_repository_id AND canonical_workflows.branch=producer_repositories.default_branch AND canonical_workflows.path=producer_workflows.path AND canonical_workflows.active=1 WHERE checks.repository_id=? AND checks.commit_id=? AND checks.producer_repository_id=?'
  )
    .bind(checkoutRepositoryId, commitId, producerRepositoryId)
    .all<{ name: string; state: string; workflowId: string; jobKey: string }>();
}

export async function mergeBlocker(
  env: Env,
  principal: Principal,
  repository: RepositoryAccess,
  pull: PullRow,
  rule: BranchRule,
  permission: { authorMerge: boolean },
  method: MergeMethod,
  queued = false
): Promise<Response | null> {
  if (permission.authorMerge) await queuePullWorkflows(env, pull.id);
  const [source, target, checks, reviews, unresolvedThreads] = await Promise.all([
    detachedSource(pull.sourceBranch)
      ? { commitId: pull.sourceCommitId }
      : env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id = ? AND name = ?')
          .bind(pull.sourceRepositoryId ?? repository.id, pull.sourceBranch)
          .first<{ commitId: string }>(),
    env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id = ? AND name = ?')
      .bind(repository.id, pull.targetBranch)
      .first<{ commitId: string }>(),
    commitChecks(env, pull.sourceRepositoryId ?? repository.id, pull.sourceCommitId, repository.id),
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
  if (source.commitId !== pull.sourceCommitId || (!queued && target.commitId !== pull.targetCommitId))
    return problem(409, 'pull_head_changed', 'The branches changed. Wait for the pull to update before merging.');
  if (!rule.allowedMergeMethods.includes(method))
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
  return null;
}
