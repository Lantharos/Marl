import type { PullStack } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import type { Env } from '../core/platform';
import { pinPullRefs } from '../git/writes';
import { createPullEvent } from './context';
import { commitPullUpdate } from './realtime/updates';

type StackPull = {
  id: string;
  repositoryId: string;
  sourceRepositoryId: string | null;
  sourceBranch: string;
  targetBranch: string;
};

const openSameRepository = `state IN ('draft','open') AND source_repository_id IS NULL`;

export async function pullStack(env: Env, pull: StackPull): Promise<PullStack> {
  const [base, dependents] = await env.DB.batch<{ number: number; title: string; state: string }>([
    env.DB.prepare(
      `SELECT number,title,state FROM pull_requests WHERE repository_id=? AND source_branch=? AND ${openSameRepository} AND id<>? ORDER BY number LIMIT 1`
    ).bind(pull.repositoryId, pull.targetBranch, pull.id),
    pull.sourceRepositoryId
      ? env.DB.prepare('SELECT number,title,state FROM pull_requests WHERE 0')
      : env.DB.prepare(
          `SELECT number,title,state FROM pull_requests WHERE repository_id=? AND target_branch=? AND state IN ('draft','open') AND id<>? ORDER BY number LIMIT 20`
        ).bind(pull.repositoryId, pull.sourceBranch, pull.id)
  ]);
  return { base: base.results[0] ?? null, dependents: dependents.results };
}

export async function retargetDependents(
  env: Env,
  principal: Principal,
  repository: { id: string; owner: string; name: string },
  merged: StackPull,
  targetHeadId: string
) {
  if (merged.sourceRepositoryId) return;
  const dependents = await env.DB.prepare(
    `SELECT id,number,source_commit_id AS sourceCommitId,target_commit_id AS targetCommitId,source_repository_id AS sourceRepositoryId,(SELECT organizations.slug FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=COALESCE(pull_requests.source_repository_id,pull_requests.repository_id)) AS sourceOwner,(SELECT name FROM repositories WHERE id=COALESCE(pull_requests.source_repository_id,pull_requests.repository_id)) AS sourceRepository FROM pull_requests WHERE repository_id=? AND target_branch=? AND state IN ('draft','open')`
  )
    .bind(repository.id, merged.sourceBranch)
    .all<{
      id: string;
      number: number;
      sourceCommitId: string;
      targetCommitId: string;
      sourceRepositoryId: string | null;
      sourceOwner: string;
      sourceRepository: string;
    }>();
  for (const dependent of dependents.results) {
    const pinned = await pinPullRefs(env, {
      owner: repository.owner,
      repository: repository.name,
      number: dependent.number,
      sourceCommitId: dependent.sourceCommitId,
      targetCommitId: targetHeadId,
      expectedSourceCommitId: dependent.sourceCommitId,
      expectedTargetCommitId: dependent.targetCommitId,
      sourceOwner: dependent.sourceOwner,
      sourceRepository: dependent.sourceRepository,
      sourceRepositoryId: dependent.sourceRepositoryId ?? repository.id
    });
    if (!pinned.ok) continue;
    const event = createPullEvent(env, dependent.id, principal, 'retargeted', {
      from: merged.sourceBranch,
      to: merged.targetBranch
    });
    await commitPullUpdate(
      env,
      dependent.id,
      'pull.synchronized',
      {
        pull: { targetBranch: merged.targetBranch, targetCommitId: targetHeadId },
        timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }],
        refreshTimeline: true,
        refreshState: true
      },
      [
        env.DB.prepare(
          `UPDATE pull_requests SET target_branch=?,target_commit_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state IN ('draft','open')`
        ).bind(merged.targetBranch, targetHeadId, dependent.id),
        event.statement
      ]
    );
  }
}
