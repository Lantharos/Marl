import type { MergeQueueEntry, MergeQueueStatus } from '@marl/contracts';
import type { Principal } from '../../auth/principal';
import { identifier } from '../../core/domain';
import type { Env } from '../../core/platform';
import { json, problem, readJson } from '../../http/http';
import { mergeBody } from '../../http/request-schemas';
import { authorizeRepository, repositoryCan } from '../../repositories/access/access';
import { branchRuleFor } from '../../repositories/branch-rules';
import { createPullEvent, pullSelect, type PullRow } from '../context';
import { mergeBlocker } from '../merge/readiness';
import { pullMergePermission } from '../permissions';
import { commitPullUpdate } from '../realtime/updates';
import { processMergeQueue } from './processor';
import { activeStates, deleteQueueBranch, leaveQueue, queueEntrySelect, type QueueEntry } from './state';

async function loadPull(env: Env, principal: Principal, owner: string, name: string, number: number) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return null;
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id=? AND pull_requests.number=?`)
    .bind(repository.id, number)
    .first<PullRow>();
  return pull ? { repository, pull } : null;
}

export async function enqueuePull(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string,
  number: number
): Promise<Response> {
  const loaded = await loadPull(env, principal, owner, name, number);
  if (!loaded) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const { repository, pull } = loaded;
  const rule = await branchRuleFor(env, repository.id, pull.targetBranch);
  const permission = pullMergePermission(repository, principal, pull.authorId, rule);
  if (!permission.allowed) return problem(403, 'merge_not_allowed', 'You do not have permission to merge this pull.');
  if (!rule.mergeQueue) return problem(409, 'merge_queue_disabled', `${pull.targetBranch} does not use a merge queue.`);
  if (pull.state !== 'open') return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  const body = await readJson(request, mergeBody);
  if (!body || body.commitId !== pull.sourceCommitId)
    return problem(409, 'pull_head_changed', 'The pull changed. Check the latest revision before queueing it.');
  const method = body.method ?? rule.allowedMergeMethods[0];
  const blocker = await mergeBlocker(env, principal, repository, pull, rule, permission, method, true);
  if (blocker) return blocker;
  const event = createPullEvent(env, pull.id, principal, 'queued', { target: pull.targetBranch });
  let update;
  try {
    update = await commitPullUpdate(
      env,
      pull.id,
      'pull.queued',
      { timeline: [{ kind: 'event', value: event.value, createdAt: event.value.createdAt }], refreshState: true },
      [
        env.DB.prepare(
          'INSERT INTO merge_queue_entries (id,repository_id,target_branch,pull_request_id,head_commit_id,method,enqueued_by) VALUES (?,?,?,?,?,?,?)'
        ).bind(
          identifier('queue'),
          repository.id,
          pull.targetBranch,
          pull.id,
          pull.sourceCommitId,
          method,
          principal.id
        ),
        event.statement
      ]
    );
  } catch (error) {
    if (String(error).includes('UNIQUE')) return json({ queued: true });
    throw error;
  }
  await processMergeQueue(env, repository.id, pull.targetBranch);
  return json({ queued: true, update }, { status: 201 });
}

export async function dequeuePull(env: Env, principal: Principal, owner: string, name: string, number: number) {
  const loaded = await loadPull(env, principal, owner, name, number);
  if (!loaded) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const { repository, pull } = loaded;
  const entry = await env.DB.prepare(`${queueEntrySelect} WHERE pull_request_id=? AND ${activeStates}`)
    .bind(pull.id)
    .first<QueueEntry>();
  if (!entry) return json({ queued: false });
  if (
    entry.enqueuedBy !== principal.id &&
    pull.authorId !== principal.id &&
    !repositoryCan(repository, principal, 'repository.push')
  )
    return problem(403, 'merge_not_allowed', 'You cannot remove this pull from the merge queue.');
  if (entry.state === 'merging') return problem(409, 'merge_in_progress', 'This pull is being merged right now.');
  const update = await leaveQueue(env, entry, 'removed', null, principal);
  if (entry.state === 'testing') {
    await deleteQueueBranch(env, entry, repository);
    await processMergeQueue(env, repository.id, pull.targetBranch);
  }
  return json({ queued: false, update });
}

export async function mergeQueueStatus(env: Env, pullId: string, enabled: boolean): Promise<MergeQueueStatus> {
  if (!enabled) return { enabled, entry: null };
  const entry = await env.DB.prepare(
    `SELECT merge_queue_entries.state,users.handle AS enqueuedBy,merge_queue_entries.enqueued_at AS enqueuedAt,(SELECT COUNT(*) FROM merge_queue_entries AS ahead WHERE ahead.repository_id=merge_queue_entries.repository_id AND ahead.target_branch=merge_queue_entries.target_branch AND ahead.${activeStates} AND (ahead.enqueued_at<merge_queue_entries.enqueued_at OR (ahead.enqueued_at=merge_queue_entries.enqueued_at AND ahead.id<merge_queue_entries.id))) AS ahead FROM merge_queue_entries JOIN users ON users.id=merge_queue_entries.enqueued_by WHERE merge_queue_entries.pull_request_id=? AND merge_queue_entries.${activeStates}`
  )
    .bind(pullId)
    .first<{ state: MergeQueueEntry['state']; enqueuedBy: string; enqueuedAt: string; ahead: number }>();
  return {
    enabled,
    entry: entry ? { ...entry, position: Number(entry.ahead) + 1 } : null
  };
}

export async function listMergeQueue(env: Env, principal: Principal | null, owner: string, name: string, url: URL) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const branch = url.searchParams.get('branch') || repository.defaultBranch;
  const rows = await env.DB.prepare(
    `SELECT merge_queue_entries.state,merge_queue_entries.enqueued_at AS enqueuedAt,enqueuers.handle AS enqueuedBy,pull_requests.number,pull_requests.title,authors.handle AS author,authors.display_name AS authorDisplayName,authors.avatar_url AS authorAvatarUrl FROM merge_queue_entries JOIN pull_requests ON pull_requests.id=merge_queue_entries.pull_request_id JOIN users AS authors ON authors.id=pull_requests.author_id JOIN users AS enqueuers ON enqueuers.id=merge_queue_entries.enqueued_by WHERE merge_queue_entries.repository_id=? AND merge_queue_entries.target_branch=? AND merge_queue_entries.${activeStates} ORDER BY merge_queue_entries.enqueued_at,merge_queue_entries.id`
  )
    .bind(repository.id, branch)
    .all<Omit<MergeQueueEntry, 'position'>>();
  return json({
    branch,
    entries: rows.results.map((row, index) => ({ ...row, number: Number(row.number), position: index + 1 }))
  });
}
