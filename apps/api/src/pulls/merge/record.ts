import type { Principal } from '../../auth/principal';
import { auditStatement } from '../../core/audit';
import type { Env } from '../../core/platform';
import { closingIssueStatements } from '../../issues/references/work-items';
import type { RepositoryAccess } from '../../repositories/access/access';
import type { MergeMethod } from '../../repositories/branch-rules';
import { createPullEvent, type PullRow } from '../context';
import { commitPullUpdate } from '../realtime/updates';
import { retargetDependents } from '../stacks';

export async function recordMerge(
  env: Env,
  principal: Principal,
  repository: RepositoryAccess,
  pull: PullRow,
  method: MergeMethod,
  result: { commitId: string; targetHeadId: string; targetCommitId: string }
) {
  const { owner, name } = repository;
  const number = pull.number;
  const targetHeadId = result.targetHeadId;
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
      ).bind(result.targetCommitId, result.commitId, method, principal.id, pull.id),
      env.DB.prepare(
        'UPDATE branches SET commit_id=?, updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND name=? AND commit_id IN (?, ?)'
      ).bind(targetHeadId, repository.id, pull.targetBranch, result.targetCommitId, result.commitId),
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
  await retargetDependents(env, principal, { id: repository.id, owner, name }, pull, targetHeadId);
  return update;
}
