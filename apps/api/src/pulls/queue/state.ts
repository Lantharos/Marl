import type { PullRealtimeUpdate } from '@marl/contracts';
import type { Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';
import { requestGitGateway } from '../../git/gateway';
import type { RepositoryAccess } from '../../repositories/access/access';
import { createPullEvent } from '../context';
import { commitPullUpdate } from '../realtime/updates';
import { queueActor } from './actor';

export type QueueEntry = {
  id: string;
  repositoryId: string;
  targetBranch: string;
  pullRequestId: string;
  headCommitId: string;
  method: string;
  enqueuedBy: string;
  state: 'queued' | 'testing' | 'merging' | 'merged' | 'failed' | 'removed';
  attempt: number;
  queueBranch: string | null;
  baseCommitId: string | null;
  mergeCommitId: string | null;
};

export const queueEntrySelect =
  'SELECT id,repository_id AS repositoryId,target_branch AS targetBranch,pull_request_id AS pullRequestId,head_commit_id AS headCommitId,method,enqueued_by AS enqueuedBy,state,attempt,queue_branch AS queueBranch,base_commit_id AS baseCommitId,merge_commit_id AS mergeCommitId FROM merge_queue_entries';

export const mergeQueuePrefix = 'marl-queue/';
export const activeStates = "state IN ('queued','testing','merging')";

export async function leaveQueue(
  env: Env,
  entry: QueueEntry,
  state: 'merged' | 'failed' | 'removed',
  reason: string | null,
  actor?: Principal
): Promise<PullRealtimeUpdate | null> {
  const leave = env.DB.prepare(
    'UPDATE merge_queue_entries SET state=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).bind(state, reason, entry.id);
  const by = state === 'merged' ? null : (actor ?? (await queueActor(env, entry.enqueuedBy)));
  if (!by) {
    await leave.run();
    return null;
  }
  const event = createPullEvent(env, entry.pullRequestId, by, 'dequeued', reason ? { reason } : {});
  return commitPullUpdate(
    env,
    entry.pullRequestId,
    'pull.dequeued',
    { timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true },
    [leave, event.statement]
  );
}

export async function deleteQueueBranch(env: Env, entry: QueueEntry, repository: RepositoryAccess) {
  if (!entry.queueBranch || !entry.mergeCommitId) return;
  await requestGitGateway(
    env,
    '/_marl/branches/delete',
    {
      owner: repository.owner,
      repository: repository.name,
      repositoryId: repository.id,
      branch: entry.queueBranch,
      expectedCommitId: entry.mergeCommitId,
      actorId: entry.enqueuedBy
    },
    { attempts: 2, timeoutMs: 30_000 }
  ).catch(() => null);
}

export async function dropQueuedPull(env: Env, pullId: string) {
  const entry = await env.DB.prepare(`${queueEntrySelect} WHERE pull_request_id=? AND state='queued'`)
    .bind(pullId)
    .first<QueueEntry>();
  if (entry) await leaveQueue(env, entry, 'removed', 'New commits were pushed after the pull was queued.');
}
