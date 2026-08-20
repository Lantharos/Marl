import type { Principal } from './auth';
import { pinPullRefs } from './git-writes';
import type { Env } from './platform';
import { createPullEvent } from './pull-context';
import { commitPullUpdate } from './pull-realtime';

type BranchHead = { name: string; commitId: string };
type PullHeadRow = {
  id: string;
  number: number;
  repositoryId: string;
  sourceRepositoryId: string;
  sourceBranch: string;
  targetBranch: string;
  sourceCommitId: string;
  targetCommitId: string;
  owner: string;
  repository: string;
  sourceOwner: string;
  sourceRepository: string;
};

export async function synchronizePullsForBranchUpdates(env: Env, repositoryId: string, branches: BranchHead[], previousHeads: Map<string, string>, actorId?: string) {
  const changed = branches.filter((branch) => previousHeads.get(branch.name) !== branch.commitId);
  if (!branches.length) return changed;
  const pulls = await affectedPulls(env, repositoryId, branches.map((branch) => branch.name));
  const heads = new Map(branches.map((branch) => [branch.name, branch.commitId]));
  const actor = await synchronizationActor(env, repositoryId, actorId);

  for (const pull of pulls) {
    const sourceCommitId = pull.sourceRepositoryId === repositoryId ? heads.get(pull.sourceBranch) ?? pull.sourceCommitId : pull.sourceCommitId;
    const targetCommitId = pull.repositoryId === repositoryId ? heads.get(pull.targetBranch) ?? pull.targetCommitId : pull.targetCommitId;
    if (sourceCommitId === pull.sourceCommitId && targetCommitId === pull.targetCommitId) continue;
    const pinned = await pinPullRefs(env, {
      owner: pull.owner,
      repository: pull.repository,
      number: pull.number,
      sourceCommitId,
      targetCommitId,
      expectedSourceCommitId: pull.sourceCommitId,
      expectedTargetCommitId: pull.targetCommitId,
      sourceOwner: pull.sourceOwner,
      sourceRepository: pull.sourceRepository,
      sourceRepositoryId: pull.sourceRepositoryId
    });
    if (!pinned.ok) throw new Error(`Pull request #${pull.number} could not preserve its updated commits.`);

    const events = [];
    const statements = [];
    const timelineRemoved: Array<{ kind: 'event'; id: string }> = [];
    if (sourceCommitId !== pull.sourceCommitId) {
      const forcePushed = !await isAncestor(env, pull.sourceRepositoryId, pull.sourceCommitId, sourceCommitId);
      if (forcePushed) {
        const previousCommitEvents = await env.DB.prepare("SELECT id FROM pull_request_events WHERE pull_request_id=? AND kind='commits_added'").bind(pull.id).all<{ id: string }>();
        timelineRemoved.push(...previousCommitEvents.results.map((event) => ({ kind: 'event' as const, id: event.id })));
        statements.push(
          env.DB.prepare("DELETE FROM pull_timeline WHERE pull_request_id=? AND kind='event' AND entity_id IN (SELECT id FROM pull_request_events WHERE pull_request_id=? AND kind='commits_added')").bind(pull.id, pull.id),
          env.DB.prepare("DELETE FROM pull_request_events WHERE pull_request_id=? AND kind='commits_added'").bind(pull.id)
        );
        events.push(createPullEvent(env, pull.id, actor, 'force_pushed', { branch: pull.sourceBranch, from: pull.sourceCommitId.slice(0, 7), to: sourceCommitId.slice(0, 7) }));
      }
      const commits = forcePushed
        ? await currentPullCommits(env, pull.sourceRepositoryId, sourceCommitId, pull.repositoryId, targetCommitId)
        : await commitsIntroducedByHead(env, pull.sourceRepositoryId, sourceCommitId, pull.sourceCommitId);
      if (commits.length) events.push(createPullEvent(env, pull.id, actor, 'commits_added', { commits: JSON.stringify(commits), owner: pull.sourceOwner, repository: pull.sourceRepository }));
    }
    const pullPatch = { sourceCommitId, targetCommitId };
    await commitPullUpdate(env, pull.id, 'pull.synchronized', {
      pull: pullPatch,
      timelineRemoved,
      timeline: events.map((event) => ({ kind: 'event', value: event.value, createdAt: event.value.createdAt })),
      refreshState: true
    }, [
      env.DB.prepare(`UPDATE pull_requests SET source_commit_id=?,target_commit_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state IN ('draft','open')`).bind(sourceCommitId, targetCommitId, pull.id),
      ...statements,
      ...events.map((event) => event.statement)
    ]);
  }
  return changed;
}

async function affectedPulls(env: Env, repositoryId: string, names: string[]) {
  const rows: PullHeadRow[] = [];
  for (let offset = 0; offset < names.length; offset += 45) {
    const chunk = names.slice(offset, offset + 45);
    const placeholders = chunk.map(() => '?').join(',');
    const result = await env.DB.prepare(`SELECT pull_requests.id,pull_requests.number,pull_requests.repository_id AS repositoryId,COALESCE(pull_requests.source_repository_id,pull_requests.repository_id) AS sourceRepositoryId,pull_requests.source_branch AS sourceBranch,pull_requests.target_branch AS targetBranch,pull_requests.source_commit_id AS sourceCommitId,pull_requests.target_commit_id AS targetCommitId,organizations.slug AS owner,repositories.name AS repository,source_organizations.slug AS sourceOwner,source_repositories.name AS sourceRepository FROM pull_requests JOIN repositories ON repositories.id=pull_requests.repository_id JOIN organizations ON organizations.id=repositories.organization_id JOIN repositories AS source_repositories ON source_repositories.id=COALESCE(pull_requests.source_repository_id,pull_requests.repository_id) JOIN organizations AS source_organizations ON source_organizations.id=source_repositories.organization_id WHERE pull_requests.state IN ('draft','open') AND ((COALESCE(pull_requests.source_repository_id,pull_requests.repository_id)=? AND pull_requests.source_branch IN (${placeholders})) OR (pull_requests.repository_id=? AND pull_requests.target_branch IN (${placeholders})))`).bind(repositoryId, ...chunk, repositoryId, ...chunk).all<PullHeadRow>();
    rows.push(...result.results);
  }
  return [...new Map(rows.map((pull) => [pull.id, pull])).values()];
}

async function synchronizationActor(env: Env, repositoryId: string, actorId?: string): Promise<Pick<Principal, 'id' | 'handle' | 'displayName'>> {
  const actor = actorId ? await env.DB.prepare('SELECT id,handle,display_name AS displayName FROM users WHERE id=?').bind(actorId).first<Pick<Principal, 'id' | 'handle' | 'displayName'>>() : null;
  if (actor) return actor;
  const creator = await env.DB.prepare('SELECT users.id,users.handle,users.display_name AS displayName FROM repositories JOIN users ON users.id=repositories.created_by WHERE repositories.id=?').bind(repositoryId).first<Pick<Principal, 'id' | 'handle' | 'displayName'>>();
  if (!creator) throw new Error('Repository synchronization actor is missing.');
  return creator;
}

async function isAncestor(env: Env, repositoryId: string, ancestor: string, descendant: string) {
  const row = await env.DB.prepare(`WITH RECURSIVE history(id) AS (SELECT ? UNION SELECT json_each.value FROM history JOIN commits ON commits.repository_id=? AND commits.id=history.id JOIN json_each(commits.parent_ids)) SELECT 1 AS found FROM history WHERE id=? LIMIT 1`).bind(descendant, repositoryId, ancestor).first();
  return Boolean(row);
}

async function commitsIntroducedByHead(env: Env, repositoryId: string, head: string, previousHead: string) {
  return env.DB.prepare(`WITH RECURSIVE head_history(id) AS (SELECT ? UNION SELECT json_each.value FROM head_history JOIN commits ON commits.repository_id=? AND commits.id=head_history.id JOIN json_each(commits.parent_ids)),previous_history(id) AS (SELECT ? UNION SELECT json_each.value FROM previous_history JOIN commits ON commits.repository_id=? AND commits.id=previous_history.id JOIN json_each(commits.parent_ids)) SELECT commits.id,commits.title FROM commits JOIN head_history ON head_history.id=commits.id LEFT JOIN previous_history ON previous_history.id=commits.id WHERE commits.repository_id=? AND previous_history.id IS NULL ORDER BY commits.authored_at,commits.id`).bind(head, repositoryId, previousHead, repositoryId, repositoryId).all<{ id: string; title: string }>().then((result) => result.results);
}

async function currentPullCommits(env: Env, sourceRepositoryId: string, sourceHead: string, targetRepositoryId: string, targetHead: string) {
  return env.DB.prepare(`WITH RECURSIVE source_history(id) AS (SELECT ? UNION SELECT json_each.value FROM source_history JOIN commits ON commits.repository_id=? AND commits.id=source_history.id JOIN json_each(commits.parent_ids)),target_history(id) AS (SELECT ? UNION SELECT json_each.value FROM target_history JOIN commits ON commits.repository_id=? AND commits.id=target_history.id JOIN json_each(commits.parent_ids)) SELECT commits.id,commits.title FROM commits JOIN source_history ON source_history.id=commits.id LEFT JOIN target_history ON target_history.id=commits.id WHERE commits.repository_id=? AND target_history.id IS NULL ORDER BY commits.authored_at,commits.id`).bind(sourceHead, sourceRepositoryId, targetHead, targetRepositoryId, sourceRepositoryId).all<{ id: string; title: string }>().then((result) => result.results);
}
