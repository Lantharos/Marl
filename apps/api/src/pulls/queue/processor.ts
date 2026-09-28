import type { Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';
import { requestGatewayWrite } from '../../git/writes';
import { authorizeRepositoryId, type RepositoryAccess } from '../../repositories/access/access';
import { branchRuleFor, type MergeMethod } from '../../repositories/branch-rules';
import { pullSelect, type PullRow } from '../context';
import { publishMergeCommit } from '../merge/publish';
import { mergeBlocker } from '../merge/readiness';
import { recordMerge } from '../merge/record';
import { pullMergePermission } from '../permissions';
import { queueActor } from './actor';
import { deleteQueueBranch, leaveQueue, mergeQueuePrefix, queueEntrySelect, type QueueEntry } from './state';
import { queueVerdict, startQueueChecks } from './testing';

const maximumAttempts = 5;

type Context = { actor: Principal; repository: RepositoryAccess; pull: PullRow };

async function loadContext(env: Env, entry: QueueEntry): Promise<Context | string> {
  const actor = await queueActor(env, entry.enqueuedBy);
  const repository = actor ? await authorizeRepositoryId(env, actor, entry.repositoryId, 'repository.read') : null;
  if (!actor || !repository) return 'The person who queued this pull can no longer merge it.';
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.id=?`)
    .bind(entry.pullRequestId)
    .first<PullRow>();
  if (!pull || pull.state !== 'open') return 'The pull is no longer open.';
  if (pull.sourceCommitId !== entry.headCommitId) return 'New commits were pushed after the pull was queued.';
  return { actor, repository, pull };
}

async function targetHead(env: Env, entry: QueueEntry) {
  const branch = await env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id=? AND name=?')
    .bind(entry.repositoryId, entry.targetBranch)
    .first<{ commitId: string }>();
  return branch?.commitId ?? null;
}

function requeue(env: Env, entry: QueueEntry, reason: string | null) {
  return env.DB.prepare(
    "UPDATE merge_queue_entries SET state=CASE WHEN attempt>=? THEN 'failed' ELSE 'queued' END,reason=CASE WHEN attempt>=? THEN ? ELSE NULL END,queue_branch=NULL,base_commit_id=NULL,merge_commit_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?"
  )
    .bind(maximumAttempts, maximumAttempts, reason, entry.id)
    .run();
}

async function claimNext(env: Env, repositoryId: string, targetBranch: string) {
  return env.DB.prepare(
    `UPDATE merge_queue_entries SET state='testing',attempt=attempt+1,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT id FROM merge_queue_entries WHERE repository_id=?1 AND target_branch=?2 AND state='queued' ORDER BY enqueued_at,id LIMIT 1) AND NOT EXISTS (SELECT 1 FROM merge_queue_entries WHERE repository_id=?1 AND target_branch=?2 AND state IN ('testing','merging')) RETURNING id`
  )
    .bind(repositoryId, targetBranch)
    .first<{ id: string }>();
}

async function startEntry(env: Env, entry: QueueEntry): Promise<'next' | 'wait'> {
  const context = await loadContext(env, entry);
  if (typeof context === 'string') {
    await leaveQueue(env, entry, 'removed', context);
    return 'next';
  }
  const { actor, repository, pull } = context;
  const rule = await branchRuleFor(env, repository.id, entry.targetBranch);
  const permission = pullMergePermission(repository, actor, pull.authorId, rule);
  const method = entry.method as MergeMethod;
  const blocker = permission.allowed
    ? await mergeBlocker(env, actor, repository, pull, rule, permission, method, true)
    : null;
  if (!permission.allowed || blocker) {
    const reason = blocker
      ? ((await blocker.json()) as { error: { message: string } }).error.message
      : 'The person who queued this pull can no longer merge it.';
    await leaveQueue(env, entry, 'removed', reason);
    return 'next';
  }
  const base = await targetHead(env, entry);
  if (!base) {
    await leaveQueue(env, entry, 'removed', `${entry.targetBranch} no longer exists.`);
    return 'next';
  }
  const direct = rule.requiredChecks.length === 0;
  const queueBranch = direct
    ? undefined
    : `${mergeQueuePrefix}${entry.targetBranch}/pr-${pull.number}-${entry.attempt}`;
  const result = await publishMergeCommit(env, {
    principal: actor,
    repository,
    pull,
    method,
    targetCommitId: base,
    queueBranch
  });
  if ('status' in result) {
    if (result.status === 409) {
      await leaveQueue(env, entry, 'failed', `The pull conflicts with ${entry.targetBranch}.`);
      return 'next';
    }
    await requeue(env, entry, result.message);
    return 'wait';
  }
  if (direct) {
    await recordMerge(env, actor, repository, pull, method, { ...result, targetCommitId: base });
    await leaveQueue(env, entry, 'merged', null);
    return 'next';
  }
  await env.DB.prepare(
    'UPDATE merge_queue_entries SET queue_branch=?,base_commit_id=?,merge_commit_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
  )
    .bind(queueBranch, base, result.commitId, entry.id)
    .run();
  await startQueueChecks(env, {
    repositoryId: repository.id,
    rule,
    branch: queueBranch!,
    commitId: result.commitId,
    actorId: actor.id
  });
  return 'wait';
}

export async function processMergeQueue(env: Env, repositoryId: string, targetBranch: string) {
  for (;;) {
    const claimed = await claimNext(env, repositoryId, targetBranch);
    if (!claimed) return;
    const entry = await env.DB.prepare(`${queueEntrySelect} WHERE id=?`).bind(claimed.id).first<QueueEntry>();
    if (!entry || (await startEntry(env, entry)) === 'wait') return;
  }
}

async function finishEntry(env: Env, entry: QueueEntry) {
  const claimed = await env.DB.prepare(
    "UPDATE merge_queue_entries SET state='merging',updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='testing' RETURNING id"
  )
    .bind(entry.id)
    .first();
  if (!claimed) return;
  const context = await loadContext(env, entry);
  if (typeof context === 'string') {
    await leaveQueue(env, entry, 'removed', context);
    return;
  }
  const { actor, repository, pull } = context;
  const advance = await requestGatewayWrite(env, '/_marl/branches/advance', {
    owner: repository.owner,
    repository: repository.name,
    repositoryId: repository.id,
    branch: entry.targetBranch,
    expectedCommitId: entry.baseCommitId!,
    commitId: entry.mergeCommitId!,
    actorId: actor.id
  });
  await advance.body?.cancel();
  if (advance.status === 409) {
    await deleteQueueBranch(env, entry, repository);
    await requeue(env, entry, `${entry.targetBranch} kept changing while the pull was being tested.`);
    return;
  }
  if (!advance.ok) {
    await env.DB.prepare("UPDATE merge_queue_entries SET state='testing' WHERE id=? AND state='merging'")
      .bind(entry.id)
      .run();
    return;
  }
  await recordMerge(env, actor, repository, pull, entry.method as MergeMethod, {
    commitId: entry.mergeCommitId!,
    targetHeadId: entry.mergeCommitId!,
    targetCommitId: entry.baseCommitId!
  });
  await leaveQueue(env, entry, 'merged', null);
  await deleteQueueBranch(env, entry, repository);
}

export async function mergeQueueChecksChanged(env: Env, repositoryId: string, commitId: string) {
  const entry = await env.DB.prepare(
    `${queueEntrySelect} WHERE merge_commit_id=? AND state='testing' AND repository_id=?`
  )
    .bind(commitId, repositoryId)
    .first<QueueEntry>();
  if (!entry) return;
  const rule = await branchRuleFor(env, repositoryId, entry.targetBranch);
  const { verdict, failed } = await queueVerdict(env, repositoryId, rule, commitId);
  if (verdict === 'pending') return;
  if (verdict === 'passed') await finishEntry(env, entry);
  else {
    const actor = await queueActor(env, entry.enqueuedBy);
    const repository = actor ? await authorizeRepositoryId(env, actor, repositoryId, 'repository.read') : null;
    if (repository) await deleteQueueBranch(env, entry, repository);
    await leaveQueue(env, entry, 'failed', `Required check “${failed}” did not pass on the merged result.`);
  }
  await processMergeQueue(env, repositoryId, entry.targetBranch);
}

export async function resumeMergeQueues(env: Env) {
  const [, testing, stalled] = await env.DB.batch<QueueEntry>([
    env.DB.prepare(
      "UPDATE merge_queue_entries SET state='testing' WHERE state='merging' AND updated_at<datetime('now','-10 minutes')"
    ),
    env.DB.prepare(`${queueEntrySelect} WHERE state='testing' AND merge_commit_id IS NOT NULL`),
    env.DB.prepare(
      `${queueEntrySelect} WHERE state='testing' AND merge_commit_id IS NULL AND updated_at<datetime('now','-10 minutes')`
    )
  ]);
  for (const entry of stalled.results) await requeue(env, entry, 'The merge could not be prepared.');
  for (const entry of testing.results) await mergeQueueChecksChanged(env, entry.repositoryId, entry.mergeCommitId!);
  const targets = await env.DB.prepare(
    "SELECT DISTINCT repository_id AS repositoryId,target_branch AS targetBranch FROM merge_queue_entries WHERE state='queued'"
  ).all<{ repositoryId: string; targetBranch: string }>();
  for (const target of targets.results) await processMergeQueue(env, target.repositoryId, target.targetBranch);
}
