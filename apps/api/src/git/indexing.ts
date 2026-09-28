import { emitRepositoryEvent } from '../webhooks/events';
import { mergeQueuePrefix } from '../pulls/queue/state';
import { auditStatement } from '../core/audit';
import type { Principal } from '../auth/principal';
import { safeRepositoryPath, validBranchName } from '../core/domain';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import { gitIndexBody } from '../http/request-schemas';
import { synchronizePullsForBranchUpdates } from '../pulls/merge/synchronization';
import { queuePushWorkflows } from '../ci/workflows/workflows';
import { queuePullsForIndexedRepository } from '../pulls/merge/checks';
import { authorizeRepository, authorizeRepositoryId, lookupRepository } from '../repositories/access/access';
import { placeholders, queryInChunks } from '../repositories/content/source';

export async function authorizeGit(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  service: string,
  gatewayTrusted = false,
  gatewayActorId?: string
): Promise<Response> {
  const repo = await lookupRepository(env, owner, name, principal);
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const read = gatewayTrusted || Boolean(await authorizeRepository(env, principal, owner, name, 'repository.read'));
  const write =
    service === 'git-receive-pack' &&
    (gatewayTrusted || Boolean(await authorizeRepository(env, principal, owner, name, 'repository.push')));
  if (repo.deletionScheduledAt) return problem(404, 'repository_not_found', 'Repository not found.');
  if (repo.archivedAt && service === 'git-receive-pack')
    return problem(409, 'repository_archived', 'Archived repositories are read-only.');
  if (!read || (service === 'git-receive-pack' && !write))
    return problem(principal ? 403 : 401, 'git_access_denied', 'You do not have access to this repository.');
  return json({
    repositoryId: repo.id,
    storageKey: repo.id,
    organizationId: repo.organizationId,
    actorId: gatewayTrusted ? gatewayActorId : principal?.id,
    visibility: repo.visibility,
    read,
    write
  });
}

export async function listPendingGitIndexes(env: Env): Promise<Response> {
  const repositories = await env.DB.prepare(
    `SELECT repositories.id AS repositoryId,organizations.slug AS owner,repositories.name AS repository FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.deletion_scheduled_at IS NULL AND EXISTS (SELECT 1 FROM commits WHERE commits.repository_id=repositories.id AND NOT EXISTS (SELECT 1 FROM indexed_commit_changes WHERE indexed_commit_changes.repository_id=commits.repository_id AND indexed_commit_changes.commit_id=commits.id)) ORDER BY repositories.id`
  ).all<{ repositoryId: string; owner: string; repository: string }>();
  return json({ repositories: repositories.results });
}

export async function indexGit(
  request: Request,
  env: Env,
  principal: Principal | null,
  gatewayTrusted = false
): Promise<Response> {
  const body = await readJson(request, gitIndexBody);
  if (
    !body ||
    typeof body.repositoryId !== 'string' ||
    !Array.isArray(body.commits) ||
    !Array.isArray(body.branches) ||
    !Array.isArray(body.entries) ||
    !Array.isArray(body.changes)
  )
    return problem(422, 'invalid_git_index', 'Git index payload is invalid.');
  if (
    body.commits.length > 250 ||
    body.changes.length > 250 ||
    body.branches.length > 250 ||
    body.entries.length > 1_000
  )
    return problem(413, 'git_index_page_too_large', 'Git index pages exceed the negotiated batch size.');
  const owned =
    gatewayTrusted ||
    (principal && (await authorizeRepositoryId(env, principal, body.repositoryId, 'repository.push')));
  if (!owned) return problem(403, 'git_access_denied', 'You cannot index this repository.');
  const changeIds = body.changes.flatMap((value) =>
    value && typeof value === 'object' && typeof (value as Record<string, unknown>).commitId === 'string'
      ? [(value as Record<string, unknown>).commitId as string]
      : []
  );
  const storedChanges = await queryInChunks(changeIds, 90, (chunk) =>
    env.DB.prepare(
      `SELECT commit_id AS commitId FROM indexed_commit_changes WHERE repository_id=? AND commit_id IN (${placeholders(chunk)})`
    )
      .bind(body.repositoryId, ...chunk)
      .all<{ commitId: string }>()
  );
  const indexedChanges = new Set(storedChanges.map((commit) => commit.commitId));
  const statements = [];
  const branchStatements = [];
  for (const value of body.commits) {
    if (!value || typeof value !== 'object') continue;
    const commit = value as Record<string, unknown>;
    if (
      ![commit.id, commit.title, commit.author, commit.authoredAt, commit.treeId].every(
        (field) => typeof field === 'string'
      ) ||
      !Array.isArray(commit.parents) ||
      !commit.parents.every((parent) => typeof parent === 'string' && /^[0-9a-f]{40,64}$/.test(parent))
    )
      continue;
    const authorEmail =
      typeof commit.authorEmail === 'string' && commit.authorEmail.length <= 320 ? commit.authorEmail : '';
    const verified =
      gatewayTrusted &&
      commit.signatureStatus === 'verified' &&
      typeof commit.signatureSignerId === 'string' &&
      commit.signatureSignerId.length > 0 &&
      commit.signatureSignerId.length <= 200 &&
      typeof commit.signatureKeyFingerprint === 'string' &&
      commit.signatureKeyFingerprint.startsWith('SHA256:');
    const signatureStatus =
      gatewayTrusted && commit.signatureStatus === 'invalid' ? 'invalid' : verified ? 'verified' : 'unverified';
    statements.push(
      env.DB.prepare(
        `INSERT INTO commits (repository_id,id,title,author_name,author_email,authored_at,tree_id,parent_ids,signature_status,signature_signer_id,signature_key_fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(repository_id,id) DO UPDATE SET title=excluded.title,author_name=excluded.author_name,author_email=excluded.author_email,authored_at=excluded.authored_at,tree_id=excluded.tree_id,parent_ids=excluded.parent_ids,signature_status=excluded.signature_status,signature_signer_id=excluded.signature_signer_id,signature_key_fingerprint=excluded.signature_key_fingerprint`
      ).bind(
        body.repositoryId,
        commit.id,
        commit.title,
        commit.author,
        authorEmail,
        commit.authoredAt,
        commit.treeId,
        JSON.stringify(commit.parents),
        signatureStatus,
        verified ? commit.signatureSignerId : null,
        verified ? commit.signatureKeyFingerprint : null
      )
    );
  }
  let indexedPaths = 0;
  for (const value of body.changes) {
    if (!value || typeof value !== 'object') continue;
    const change = value as Record<string, unknown>;
    if (
      typeof change.commitId !== 'string' ||
      !/^[0-9a-f]{40,64}$/.test(change.commitId) ||
      typeof change.position !== 'number' ||
      !Number.isSafeInteger(change.position) ||
      change.position < 0 ||
      !Array.isArray(change.paths)
    )
      continue;
    if (indexedChanges.has(change.commitId)) continue;
    const paths = [
      ...new Set(change.paths.filter((path): path is string => typeof path === 'string' && safeRepositoryPath(path)))
    ];
    if (paths.length > 100_000 || indexedPaths + paths.length > 100_000)
      return problem(413, 'git_index_page_too_large', 'Changed paths must be split across smaller index pages.');
    for (let offset = 0; offset < paths.length; offset += 20) {
      const chunk = paths.slice(offset, offset + 20);
      const values = chunk.map(() => '(?,?,?,?)').join(',');
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO commit_changes (repository_id,commit_id,path,position) VALUES ${values}`
        ).bind(...chunk.flatMap((path) => [body.repositoryId, change.commitId, path, change.position]))
      );
    }
    statements.push(
      env.DB.prepare('INSERT OR IGNORE INTO indexed_commit_changes (repository_id,commit_id) VALUES (?,?)').bind(
        body.repositoryId,
        change.commitId
      )
    );
    indexedPaths += paths.length;
  }
  const indexedBranches: Array<{ name: string; commitId: string }> = [];
  for (const value of body.branches) {
    if (!value || typeof value !== 'object') continue;
    const branch = value as Record<string, unknown>;
    if (
      typeof branch.name !== 'string' ||
      !validBranchName(branch.name) ||
      typeof branch.commitId !== 'string' ||
      !/^[0-9a-f]{40,64}$/.test(branch.commitId)
    )
      continue;
    indexedBranches.push({ name: branch.name, commitId: branch.commitId });
    branchStatements.push(
      env.DB.prepare(
        `INSERT INTO branches (repository_id, name, commit_id, index_version) VALUES (?, ?, ?, ?) ON CONFLICT(repository_id, name) DO UPDATE SET commit_id=excluded.commit_id,index_version=excluded.index_version,updated_at=CURRENT_TIMESTAMP`
      ).bind(body.repositoryId, branch.name, branch.commitId, body.indexId)
    );
  }
  for (const value of body.entries) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    if (
      ![entry.treeId, entry.path, entry.parentPath, entry.name, entry.kind, entry.objectId].every(
        (field) => typeof field === 'string'
      )
    )
      continue;
    statements.push(
      env.DB.prepare(
        `INSERT INTO repository_entries (repository_id, tree_id, path, parent_path, name, kind, object_id, byte_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(repository_id, tree_id, path) DO UPDATE SET kind=excluded.kind, object_id=excluded.object_id, byte_size=excluded.byte_size`
      ).bind(
        body.repositoryId,
        entry.treeId,
        entry.path,
        entry.parentPath,
        entry.name,
        entry.kind,
        entry.objectId,
        typeof entry.byteSize === 'number' ? entry.byteSize : null
      )
    );
  }
  const previous = await queryInChunks(
    indexedBranches.map((branch) => branch.name),
    90,
    (chunk) =>
      env.DB.prepare(
        `SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name IN (${placeholders(chunk)})`
      )
        .bind(body.repositoryId, ...chunk)
        .all<{ name: string; commitId: string }>()
  );
  const previousHeads = new Map(previous.map((branch) => [branch.name, branch.commitId]));
  for (let offset = 0; offset < statements.length; offset += 100)
    await env.DB.batch(statements.slice(offset, offset + 100));
  let changedBranches;
  try {
    changedBranches = await synchronizePullsForBranchUpdates(
      env,
      body.repositoryId,
      indexedBranches,
      previousHeads,
      typeof body.actorId === 'string' ? body.actorId : principal?.id
    );
  } catch (error) {
    return problem(
      502,
      'pull_ref_sync_failed',
      error instanceof Error ? error.message : 'Pull request commits could not be synchronized.'
    );
  }
  for (let offset = 0; offset < branchStatements.length; offset += 100)
    await env.DB.batch(branchStatements.slice(offset, offset + 100));
  if (body.complete && typeof body.defaultBranch === 'string')
    await env.DB.prepare('UPDATE repositories SET default_branch = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(body.defaultBranch, body.repositoryId)
      .run();
  if (body.complete)
    await env.DB.prepare('DELETE FROM branches WHERE repository_id=? AND index_version!=?')
      .bind(body.repositoryId, body.indexId)
      .run();
  const actorId =
    (gatewayTrusted ? body.actorId : principal?.id) ??
    (
      await env.DB.prepare('SELECT created_by AS createdBy FROM repositories WHERE id=?')
        .bind(body.repositoryId)
        .first<{ createdBy: string }>()
    )?.createdBy ??
    null;
  if (changedBranches.length) {
    const auditRepository = await env.DB.prepare(
      'SELECT organization_id AS organizationId FROM repositories WHERE id=?'
    )
      .bind(body.repositoryId)
      .first<{ organizationId: string }>();
    if (auditRepository)
      await auditStatement(env, {
        organizationId: auditRepository.organizationId,
        repositoryId: body.repositoryId,
        actor: principal,
        action: 'repository.refs.indexed',
        subjectType: 'repository',
        subjectId: body.repositoryId,
        details: {
          refs: changedBranches.map((branch) => ({
            name: branch.name,
            commitId: branch.commitId
          }))
        }
      }).run();
    const sender = actorId
      ? await env.DB.prepare('SELECT handle FROM users WHERE id=?').bind(actorId).first<{ handle: string }>()
      : null;
    for (const branch of changedBranches.filter((changed) => !changed.name.startsWith(mergeQueuePrefix)))
      await emitRepositoryEvent(
        env,
        body.repositoryId,
        'push',
        'pushed',
        {
          kind: 'push',
          ref: `refs/heads/${branch.name}`,
          before: previousHeads.get(branch.name) ?? null,
          after: branch.commitId
        },
        sender?.handle ?? null
      );
  }
  const branchCommits = await queryInChunks(
    [...new Set(indexedBranches.map((branch) => branch.commitId))],
    90,
    (chunk) =>
      env.DB.prepare(
        `SELECT id,tree_id AS treeId FROM commits WHERE repository_id=? AND id IN (${placeholders(chunk)})`
      )
        .bind(body.repositoryId, ...chunk)
        .all<{ id: string; treeId: string }>()
  );
  const trees = new Map(branchCommits.map((commit) => [commit.id, commit.treeId]));
  let workflowsQueued = 0;
  const workflowWarnings = [];
  const changedBranchNames = new Set(changedBranches.map((branch) => branch.name));
  for (const branch of indexedBranches) {
    if (branch.name.startsWith(mergeQueuePrefix)) continue;
    const treeId = trees.get(branch.commitId);
    if (typeof treeId !== 'string') continue;
    const result = await queuePushWorkflows(
      env,
      body.repositoryId,
      branch.name,
      branch.commitId,
      treeId,
      actorId,
      changedBranchNames.has(branch.name)
    );
    workflowsQueued += result.queued;
    workflowWarnings.push(...result.warnings);
  }
  await queuePullsForIndexedRepository(
    env,
    body.repositoryId,
    indexedBranches.map((branch) => branch.name)
  );
  return json({
    indexed: {
      commits: body.commits.length,
      branches: indexedBranches.length,
      entries: body.entries.length,
      changes: body.changes.length,
      complete: Boolean(body.complete)
    },
    workflows: { queued: workflowsQueued, warnings: workflowWarnings }
  });
}
