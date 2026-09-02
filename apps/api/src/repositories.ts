import type { RepositorySummary } from '@marl/contracts';
import { auditStatement } from './audit';
import { requireFreshSession, type Principal } from './auth';
import { identifier, safeRepositoryPath, validBranchName, validIdentitySlug, validSlug, validVisibility } from './domain';
import { pageResult, pageSize, readCursor } from './cursor';
import { requestGitGateway } from './git-gateway';
import { json, problem, readJson, readJsonValue } from './http';
import { readListQuery } from './list-query';
import type { D1Result, Env } from './platform';
import { createRepositoryBody, deleteRepositoryBody, forkRepositoryBody, gitIndexBody, renameRepositoryBody, repositoryOverviewBody, repositorySettingsBody, transferRepositoryBody } from './request-schemas';
import { synchronizePullsForBranchUpdates } from './pull-synchronization';
import { queuePushWorkflows } from './workflows';
import { authorizeRepository, authorizeRepositoryId, lookupRepository, repositoryListFilter, repositoryPermissions, repositoryReadFilter } from './repository-access';
import { commitAuthorIdSql } from './commit-authors';
import { readImageAsset, readImageUpload, storedImageKey } from './image-assets';
import { rawBlobHeaders } from './raw-content';

type RepositoryRow = RepositorySummary & {
  organizationId: string;
  defaultBranch: string;
  archivedAt: string | null;
  deletionScheduledAt: string | null;
};

const selectRepository = `SELECT repositories.id, organizations.slug AS owner, repositories.name, repositories.description, repositories.icon_url AS iconUrl, repositories.visibility, repositories.default_branch AS defaultBranch, repositories.updated_at AS updatedAt, repositories.organization_id AS organizationId, repositories.archived_at AS archivedAt, repositories.deletion_scheduled_at AS deletionScheduledAt FROM repositories JOIN organizations ON organizations.id = repositories.organization_id`;

export async function authorizeGit(env: Env, principal: Principal | null, owner: string, name: string, service: string, gatewayTrusted = false, gatewayActorId?: string): Promise<Response> {
  const repo = await lookupRepository(env, owner, name, principal);
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const read = gatewayTrusted || Boolean(await authorizeRepository(env, principal, owner, name, 'repository.read'));
  const write = service === 'git-receive-pack' && (gatewayTrusted || Boolean(await authorizeRepository(env, principal, owner, name, 'repository.push')));
  if (repo.deletionScheduledAt) return problem(404, 'repository_not_found', 'Repository not found.');
  if (repo.archivedAt && service === 'git-receive-pack') return problem(409, 'repository_archived', 'Archived repositories are read-only.');
  if (!read || (service === 'git-receive-pack' && !write)) return problem(principal ? 403 : 401, 'git_access_denied', 'You do not have access to this repository.');
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
  const repositories = await env.DB.prepare(`SELECT repositories.id AS repositoryId,organizations.slug AS owner,repositories.name AS repository FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.deletion_scheduled_at IS NULL AND EXISTS (SELECT 1 FROM commits WHERE commits.repository_id=repositories.id AND NOT EXISTS (SELECT 1 FROM indexed_commit_changes WHERE indexed_commit_changes.repository_id=commits.repository_id AND indexed_commit_changes.commit_id=commits.id)) ORDER BY repositories.id`).all<{ repositoryId: string; owner: string; repository: string }>();
  return json({ repositories: repositories.results });
}

export async function indexGit(request: Request, env: Env, principal: Principal | null, gatewayTrusted = false): Promise<Response> {
  const body = await readJson(request, gitIndexBody);
  if (!body || typeof body.repositoryId !== 'string' || !Array.isArray(body.commits) || !Array.isArray(body.branches) || !Array.isArray(body.entries) || !Array.isArray(body.changes)) return problem(422, 'invalid_git_index', 'Git index payload is invalid.');
  if (body.commits.length > 250 || body.changes.length > 250 || body.branches.length > 250 || body.entries.length > 1_000) return problem(413, 'git_index_page_too_large', 'Git index pages exceed the negotiated batch size.');
  const owned = gatewayTrusted || (principal && (await authorizeRepositoryId(env, principal, body.repositoryId, 'repository.push')));
  if (!owned) return problem(403, 'git_access_denied', 'You cannot index this repository.');
  const changeIds = body.changes.flatMap((value) => (value && typeof value === 'object' && typeof (value as Record<string, unknown>).commitId === 'string' ? [(value as Record<string, unknown>).commitId as string] : []));
  const storedChanges = await queryInChunks(changeIds, 90, (chunk) =>
    env.DB.prepare(`SELECT commit_id AS commitId FROM indexed_commit_changes WHERE repository_id=? AND commit_id IN (${placeholders(chunk)})`)
      .bind(body.repositoryId, ...chunk)
      .all<{ commitId: string }>()
  );
  const indexedChanges = new Set(storedChanges.map((commit) => commit.commitId));
  const statements = [];
  const branchStatements = [];
  for (const value of body.commits) {
    if (!value || typeof value !== 'object') continue;
    const commit = value as Record<string, unknown>;
    if (![commit.id, commit.title, commit.author, commit.authoredAt, commit.treeId].every((field) => typeof field === 'string') || !Array.isArray(commit.parents) || !commit.parents.every((parent) => typeof parent === 'string' && /^[0-9a-f]{40,64}$/.test(parent))) continue;
    const authorEmail = typeof commit.authorEmail === 'string' && commit.authorEmail.length <= 320 ? commit.authorEmail : '';
    const verified = gatewayTrusted && commit.signatureStatus === 'verified' && typeof commit.signatureSignerId === 'string' && commit.signatureSignerId.length > 0 && commit.signatureSignerId.length <= 200 && typeof commit.signatureKeyFingerprint === 'string' && commit.signatureKeyFingerprint.startsWith('SHA256:');
    const signatureStatus = gatewayTrusted && commit.signatureStatus === 'invalid' ? 'invalid' : verified ? 'verified' : 'unverified';
    statements.push(env.DB.prepare(`INSERT INTO commits (repository_id,id,title,author_name,author_email,authored_at,tree_id,parent_ids,signature_status,signature_signer_id,signature_key_fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(repository_id,id) DO UPDATE SET title=excluded.title,author_name=excluded.author_name,author_email=excluded.author_email,authored_at=excluded.authored_at,tree_id=excluded.tree_id,parent_ids=excluded.parent_ids,signature_status=excluded.signature_status,signature_signer_id=excluded.signature_signer_id,signature_key_fingerprint=excluded.signature_key_fingerprint`).bind(body.repositoryId, commit.id, commit.title, commit.author, authorEmail, commit.authoredAt, commit.treeId, JSON.stringify(commit.parents), signatureStatus, verified ? commit.signatureSignerId : null, verified ? commit.signatureKeyFingerprint : null));
  }
  let indexedPaths = 0;
  for (const value of body.changes) {
    if (!value || typeof value !== 'object') continue;
    const change = value as Record<string, unknown>;
    if (typeof change.commitId !== 'string' || !/^[0-9a-f]{40,64}$/.test(change.commitId) || typeof change.position !== 'number' || !Number.isSafeInteger(change.position) || change.position < 0 || !Array.isArray(change.paths)) continue;
    if (indexedChanges.has(change.commitId)) continue;
    const paths = [...new Set(change.paths.filter((path): path is string => typeof path === 'string' && safeRepositoryPath(path)))];
    if (paths.length > 100_000 || indexedPaths + paths.length > 100_000) return problem(413, 'git_index_page_too_large', 'Changed paths must be split across smaller index pages.');
    for (let offset = 0; offset < paths.length; offset += 20) {
      const chunk = paths.slice(offset, offset + 20);
      const values = chunk.map(() => '(?,?,?,?)').join(',');
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO commit_changes (repository_id,commit_id,path,position) VALUES ${values}`).bind(...chunk.flatMap((path) => [body.repositoryId, change.commitId, path, change.position])));
    }
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO indexed_commit_changes (repository_id,commit_id) VALUES (?,?)').bind(body.repositoryId, change.commitId));
    indexedPaths += paths.length;
  }
  const indexedBranches: Array<{ name: string; commitId: string }> = [];
  for (const value of body.branches) {
    if (!value || typeof value !== 'object') continue;
    const branch = value as Record<string, unknown>;
    if (typeof branch.name !== 'string' || !validBranchName(branch.name) || typeof branch.commitId !== 'string' || !/^[0-9a-f]{40,64}$/.test(branch.commitId)) continue;
    indexedBranches.push({ name: branch.name, commitId: branch.commitId });
    branchStatements.push(env.DB.prepare(`INSERT INTO branches (repository_id, name, commit_id, index_version) VALUES (?, ?, ?, ?) ON CONFLICT(repository_id, name) DO UPDATE SET commit_id=excluded.commit_id,index_version=excluded.index_version,updated_at=CURRENT_TIMESTAMP`).bind(body.repositoryId, branch.name, branch.commitId, body.indexId));
  }
  for (const value of body.entries) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    if (![entry.treeId, entry.path, entry.parentPath, entry.name, entry.kind, entry.objectId].every((field) => typeof field === 'string')) continue;
    statements.push(env.DB.prepare(`INSERT INTO repository_entries (repository_id, tree_id, path, parent_path, name, kind, object_id, byte_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(repository_id, tree_id, path) DO UPDATE SET kind=excluded.kind, object_id=excluded.object_id, byte_size=excluded.byte_size`).bind(body.repositoryId, entry.treeId, entry.path, entry.parentPath, entry.name, entry.kind, entry.objectId, typeof entry.byteSize === 'number' ? entry.byteSize : null));
  }
  const previous = await queryInChunks(
    indexedBranches.map((branch) => branch.name),
    90,
    (chunk) =>
      env.DB.prepare(`SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name IN (${placeholders(chunk)})`)
        .bind(body.repositoryId, ...chunk)
        .all<{ name: string; commitId: string }>()
  );
  const previousHeads = new Map(previous.map((branch) => [branch.name, branch.commitId]));
  for (let offset = 0; offset < statements.length; offset += 100) await env.DB.batch(statements.slice(offset, offset + 100));
  let changedBranches;
  try {
    changedBranches = await synchronizePullsForBranchUpdates(env, body.repositoryId, indexedBranches, previousHeads, typeof body.actorId === 'string' ? body.actorId : principal?.id);
  } catch (error) {
    return problem(502, 'pull_ref_sync_failed', error instanceof Error ? error.message : 'Pull request commits could not be synchronized.');
  }
  for (let offset = 0; offset < branchStatements.length; offset += 100) await env.DB.batch(branchStatements.slice(offset, offset + 100));
  if (body.complete && typeof body.defaultBranch === 'string') await env.DB.prepare('UPDATE repositories SET default_branch = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.defaultBranch, body.repositoryId).run();
  if (body.complete) await env.DB.prepare('DELETE FROM branches WHERE repository_id=? AND index_version!=?').bind(body.repositoryId, body.indexId).run();
  const actorId = (gatewayTrusted ? body.actorId : principal?.id) ?? (await env.DB.prepare('SELECT created_by AS createdBy FROM repositories WHERE id=?').bind(body.repositoryId).first<{ createdBy: string }>())?.createdBy ?? null;
  if (changedBranches.length) {
    const auditRepository = await env.DB.prepare('SELECT organization_id AS organizationId FROM repositories WHERE id=?').bind(body.repositoryId).first<{ organizationId: string }>();
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
  }
  const branchCommits = await queryInChunks([...new Set(indexedBranches.map((branch) => branch.commitId))], 90, (chunk) =>
    env.DB.prepare(`SELECT id,tree_id AS treeId FROM commits WHERE repository_id=? AND id IN (${placeholders(chunk)})`)
      .bind(body.repositoryId, ...chunk)
      .all<{ id: string; treeId: string }>()
  );
  const trees = new Map(branchCommits.map((commit) => [commit.id, commit.treeId]));
  let workflowsQueued = 0;
  const workflowWarnings = [];
  const changedBranchNames = new Set(changedBranches.map((branch) => branch.name));
  for (const branch of indexedBranches) {
    const treeId = trees.get(branch.commitId);
    if (typeof treeId !== 'string') continue;
    const result = await queuePushWorkflows(env, body.repositoryId, branch.name, branch.commitId, treeId, actorId, changedBranchNames.has(branch.name));
    workflowsQueued += result.queued;
    workflowWarnings.push(...result.warnings);
  }
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

export async function listRepositories(env: Env, principal: Principal, url: URL): Promise<Response> {
  const search = readListQuery(url);
  if ('error' in search) return search.error;
  const limit = pageSize(url);
  const cursor = readCursor(url);
  const access = repositoryListFilter(principal);
  const visibility = url.searchParams.get('visibility') ?? 'all';
  if (!['all', 'public', 'private', 'archived'].includes(visibility)) return problem(422, 'invalid_visibility', 'Repository visibility is invalid.');
  const visibilitySql = visibility === 'archived' ? 'AND repositories.archived_at IS NOT NULL' : `${visibility === 'all' ? '' : 'AND repositories.visibility=?'} AND repositories.archived_at IS NULL`;
  const querySql = search.query ? `AND (repositories.name LIKE ? ESCAPE '\\' OR organizations.slug LIKE ? ESCAPE '\\' OR repositories.description LIKE ? ESCAPE '\\')` : '';
  const after = cursor ? 'AND (repositories.updated_at<? OR (repositories.updated_at=? AND repositories.id<?))' : '';
  const filters = [...access.values, ...(['public', 'private'].includes(visibility) ? [visibility] : []), ...(search.query ? [search.like, search.like, search.like] : [])];
  const values = cursor ? [...filters, cursor.value, cursor.value, cursor.id, limit + 1] : [...filters, limit + 1];
  const result = await env.DB.prepare(`${selectRepository} WHERE ${access.sql} AND repositories.deletion_scheduled_at IS NULL ${visibilitySql} ${querySql} ${after} ORDER BY repositories.updated_at DESC,repositories.id DESC LIMIT ?`)
    .bind(...values)
    .all<RepositoryRow>();
  const page = pageResult(result.results, limit, (row) => ({
    value: row.updatedAt,
    id: row.id
  }));
  return json({
    repositories: page.items.map(({ organizationId: _, defaultBranch: __, ...repo }) => repo),
    nextCursor: page.nextCursor
  });
}

export async function listShellRepositories(env: Env, principal: Principal): Promise<RepositorySummary[]> {
  const access = repositoryListFilter(principal);
  const result = await env.DB.prepare(`${selectRepository} WHERE ${access.sql} AND repositories.deletion_scheduled_at IS NULL AND repositories.archived_at IS NULL ORDER BY repositories.updated_at DESC,repositories.id DESC LIMIT 100`)
    .bind(...access.values)
    .all<RepositoryRow>();
  return result.results.map(({ organizationId: _, defaultBranch: __, ...repository }) => repository);
}

export async function createRepository(request: Request, env: Env, principal: Principal): Promise<Response> {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Repositories must be created from a browser session.');
  const body = await readJson(request, createRepositoryBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const { owner, name, description = '', visibility = 'private' } = body;
  if (!validIdentitySlug(owner) || !validSlug(name)) return problem(422, 'invalid_repository_name', 'Owner and repository names must be URL-safe slugs.');
  if (typeof description !== 'string' || description.length > 280 || !validVisibility(visibility)) return problem(422, 'invalid_repository', 'Description or visibility is invalid.');
  const organization = await env.DB.prepare(`SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id = organizations.id WHERE organizations.slug = ? COLLATE NOCASE AND organization_members.user_id = ? AND organization_members.role IN ('owner','admin')`).bind(owner, principal.id).first<{ id: string }>();
  if (!organization) return problem(403, 'owner_required', 'You cannot create repositories for this owner.');
  const id = identifier('repo');
  const defaults = [
    ['bug', '#e16f73', 'Something is not working'],
    ['enhancement', '#8c7ad8', 'New or improved functionality'],
    ['documentation', '#68a7b8', 'Documentation changes'],
    ['needs review', '#d3a45f', 'Ready for reviewer attention']
  ];
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO repositories (id, organization_id, name, description, visibility, created_by) VALUES (?, ?, ?, ?, ?, ?)').bind(id, organization.id, name, description, visibility, principal.id),
      ...defaults.map(([label, color, detail]) => env.DB.prepare('INSERT INTO repository_labels (id,repository_id,name,color,description) VALUES (?,?,?,?,?)').bind(identifier('label'), id, label, color, detail)),
      auditStatement(env, {
        organizationId: organization.id,
        repositoryId: id,
        actor: principal,
        action: 'repository.created',
        subjectType: 'repository',
        subjectId: id,
        details: { owner, name, visibility }
      })
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'repository_exists', 'A repository with this name already exists.');
    throw error;
  }
  return json(
    {
      repository: {
        id,
        owner,
        name,
        description,
        iconUrl: null,
        visibility,
        updatedAt: new Date().toISOString()
      }
    },
    { status: 201 }
  );
}

export async function uploadRepositoryIcon(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const image = await readImageUpload(request);
  if (!image) return problem(422, 'invalid_repository_icon', 'Choose a valid PNG, JPEG, or WebP image under 2 MB.');
  const key = `repository-icons/${repository.id}/${image.version}.${image.extension}`;
  const iconUrl = `/api/v1/repository-icons/${repository.id}/${image.version}.${image.extension}`;
  await env.OBJECTS.put(key, image.bytes, {
    httpMetadata: { contentType: image.contentType }
  });
  try {
    await env.DB.prepare('UPDATE repositories SET icon_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(iconUrl, repository.id).run();
  } catch (error) {
    await env.OBJECTS.delete(key);
    throw error;
  }
  const previousKey = repository.iconUrl && storedImageKey(repository.iconUrl, 'repository-icons', repository.id);
  if (previousKey) await env.OBJECTS.delete(previousKey);
  return json({ iconUrl });
}

export async function readRepositoryIcon(env: Env, repositoryId: string, file: string): Promise<Response> {
  if (!/^repo_[a-z0-9]+$/.test(repositoryId) || !/^[a-f0-9]{32}\.(?:png|jpg|webp)$/.test(file)) return problem(404, 'repository_icon_not_found', 'Repository icon not found.');
  return readImageAsset(env, `repository-icons/${repositoryId}/${file}`);
}

export async function getRepository(env: Env, principal: Principal | null, owner: string, name: string): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const sshBase = env.GIT_SSH_PUBLIC_URL ?? (env.ENVIRONMENT === 'development' ? 'ssh://git@127.0.0.1:42621' : undefined);
  const forkAccess = repositoryReadFilter(principal, 'forks');
  const [social, upstream] = await Promise.all([
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM repository_stars WHERE repository_id=repositories.id) AS starCount,(SELECT COUNT(*) FROM repositories AS forks WHERE forks.forked_from_repository_id=repositories.id AND ${forkAccess.sql} AND forks.deletion_scheduled_at IS NULL) AS forkCount,EXISTS(SELECT 1 FROM repository_stars WHERE repository_id=repositories.id AND user_id=?) AS starred FROM repositories WHERE repositories.id=?`).bind(...forkAccess.values, principal?.id ?? '', repo.id).first<{
    starCount: number;
    forkCount: number;
    starred: number;
    }>(),
    repo.forkedFromRepositoryId ? authorizeRepositoryId(env, principal, repo.forkedFromRepositoryId, 'repository.read') : null
  ]);
  return json({
    repository: {
      id: repo.id,
      owner: repo.owner,
      name: repo.name,
      description: repo.description,
      iconUrl: repo.iconUrl,
      visibility: repo.visibility,
      defaultBranch: repo.defaultBranch,
      updatedAt: repo.updatedAt,
      archivedAt: repo.archivedAt,
      permissions: repositoryPermissions(repo.role, true),
      starred: Boolean(social?.starred),
      starCount: Number(social?.starCount ?? 0),
      forkCount: Number(social?.forkCount ?? 0),
      upstream: upstream ? { owner: upstream.owner, name: upstream.name } : null,
      cloneUrl: `${env.GIT_PUBLIC_URL ?? env.GIT_GATEWAY_URL}/${repo.owner}/${repo.name}.git`,
      sshCloneUrl: sshBase ? `${sshBase.replace(/\/$/, '')}/${repo.owner}/${repo.name}.git` : null
    }
  });
}

type OverviewDocument = { path: string; label: string };

const overviewNames = [
  [/^readme(?:\.(?:md|markdown|txt))?$/i, 'README'],
  [/^(?:license|copying)(?:\.(?:md|markdown|txt))?$/i, 'License'],
  [/^contributing(?:\.(?:md|markdown|txt))?$/i, 'Contributing'],
  [/^code[_-]of[_-]conduct(?:\.(?:md|markdown|txt))?$/i, 'Code of conduct'],
  [/^security(?:\.(?:md|markdown|txt))?$/i, 'Security'],
  [/^support(?:\.(?:md|markdown|txt))?$/i, 'Support']
] as const;

export async function getRepositoryOverview(env: Env, principal: Principal | null, owner: string, name: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const available = await overviewCandidates(env, repository.id, repository.defaultBranch);
  const stored = await env.DB.prepare('SELECT overview_documents_json AS documentsJson FROM repositories WHERE id=?').bind(repository.id).first<{ documentsJson: string | null }>();
  const selected = stored?.documentsJson === null || stored?.documentsJson === undefined ? automaticOverviewDocuments(available) : selectedOverviewDocuments(available, stored.documentsJson);
  return json({
    documents: selected,
    availableDocuments: available,
    canManage: repository.role === 'maintain' || repository.role === 'admin'
  });
}

export async function updateRepositoryOverview(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.maintain');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, repositoryOverviewBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a valid overview document list.');
  const paths = [...new Set(body.documents)];
  if (paths.length !== body.documents.length || paths.some((path) => !safeRepositoryPath(path))) return problem(422, 'invalid_overview_documents', 'Overview documents must be unique repository paths.');
  const available = await overviewCandidates(env, repository.id, repository.defaultBranch);
  const availablePaths = new Set(available.map((document) => document.path));
  if (paths.some((path) => !availablePaths.has(path))) return problem(422, 'overview_document_not_found', 'Every overview document must exist on the default branch and use Markdown or plain text.');
  await env.DB.batch([
    env.DB.prepare('UPDATE repositories SET overview_documents_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(paths), repository.id),
    auditStatement(env, {
      organizationId: repository.organizationId,
      repositoryId: repository.id,
      actor: principal,
      action: 'repository.overview.updated',
      subjectType: 'repository',
      subjectId: repository.id,
      details: { documents: paths }
    })
  ]);
  return json({
    documents: paths.map((path) => available.find((document) => document.path === path)!)
  });
}

async function overviewCandidates(env: Env, repositoryId: string, defaultBranch: string): Promise<OverviewDocument[]> {
  const rows = await env.DB.prepare(`SELECT repository_entries.path,repository_entries.name FROM branches JOIN commits ON commits.repository_id=branches.repository_id AND commits.id=branches.commit_id JOIN repository_entries ON repository_entries.repository_id=branches.repository_id AND repository_entries.tree_id=commits.tree_id WHERE branches.repository_id=? AND branches.name=? AND repository_entries.kind='blob' AND (lower(repository_entries.name) LIKE '%.md' OR lower(repository_entries.name) LIKE '%.markdown' OR lower(repository_entries.name) LIKE '%.txt' OR instr(repository_entries.name,'.')=0) ORDER BY repository_entries.path COLLATE NOCASE LIMIT 500`).bind(repositoryId, defaultBranch).all<{ path: string; name: string }>();
  return rows.results.map((entry) => ({
    path: entry.path,
    label: overviewLabel(entry.name)
  }));
}

function automaticOverviewDocuments(available: OverviewDocument[]) {
  return overviewNames.flatMap(([pattern, label]) => {
    const document = available.find((candidate) => !candidate.path.includes('/') && pattern.test(candidate.path));
    return document ? [{ ...document, label }] : [];
  });
}

function selectedOverviewDocuments(available: OverviewDocument[], value: string) {
  let paths: unknown;
  try {
    paths = JSON.parse(value);
  } catch {
    return automaticOverviewDocuments(available);
  }
  if (!Array.isArray(paths)) return automaticOverviewDocuments(available);
  const documents = new Map(available.map((document) => [document.path, document]));
  return paths.flatMap((path) => (typeof path === 'string' && documents.has(path) ? [documents.get(path)!] : []));
}

function overviewLabel(name: string) {
  const known = overviewNames.find(([pattern]) => pattern.test(name));
  if (known) return known[1];
  return name
    .replace(/\.(?:md|markdown|txt)$/i, '')
    .replaceAll(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function setRepositoryStar(env: Env, principal: Principal, owner: string, name: string, starred: boolean): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  if (starred) await env.DB.prepare('INSERT OR IGNORE INTO repository_stars (repository_id,user_id) VALUES (?,?)').bind(repository.id, principal.id).run();
  else await env.DB.prepare('DELETE FROM repository_stars WHERE repository_id=? AND user_id=?').bind(repository.id, principal.id).run();
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM repository_stars WHERE repository_id=?').bind(repository.id).first<{ count: number }>();
  return json({ starred, starCount: Number(count?.count ?? 0) });
}

export async function forkRepository(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Repositories must be forked from a browser session.');
  const source = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!source) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, forkRepositoryBody);
  if (!body || !validIdentitySlug(body.owner) || !validSlug(body.name)) return problem(422, 'invalid_repository_name', 'Owner and repository names must be URL-safe slugs.');
  const destination = await env.DB.prepare(`SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organizations.slug=? COLLATE NOCASE AND organization_members.user_id=? AND organization_members.role IN ('owner','admin')`).bind(body.owner, principal.id).first<{ id: string }>();
  if (!destination) return problem(403, 'owner_required', 'You cannot create repositories for this owner.');
  const rootId = source.forkRootRepositoryId ?? source.id;
  const existingFork = await env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.organization_id=? AND COALESCE(repositories.fork_root_repository_id,repositories.id)=? AND repositories.deletion_scheduled_at IS NULL`).bind(destination.id, rootId).first<{ owner: string; name: string }>();
  if (existingFork) return problem(409, 'fork_exists', `This organization already has the fork ${existingFork.owner}/${existingFork.name}.`);
  const id = identifier('repo');
  const defaults = [
    ['bug', '#e16f73', 'Something is not working'],
    ['enhancement', '#8c7ad8', 'New or improved functionality'],
    ['documentation', '#68a7b8', 'Documentation changes'],
    ['needs review', '#d3a45f', 'Ready for reviewer attention']
  ];
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO repositories (id,organization_id,name,description,visibility,default_branch,created_by,forked_from_repository_id,fork_root_repository_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, destination.id, body.name, source.description, source.visibility, source.defaultBranch, principal.id, source.id, rootId),
      ...defaults.map(([label, color, detail]) => env.DB.prepare('INSERT INTO repository_labels (id,repository_id,name,color,description) VALUES (?,?,?,?,?)').bind(identifier('label'), id, label, color, detail)),
      auditStatement(env, {
        organizationId: destination.id,
        repositoryId: id,
        actor: principal,
        action: 'repository.forked',
        subjectType: 'repository',
        subjectId: id,
        details: { source: `${owner}/${name}` }
      })
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'repository_exists', 'A repository with this name already exists.');
    throw error;
  }
  const copied = await requestGitGateway(
    env,
    '/_marl/repositories/fork',
    {
      repositoryId: id,
      sourceRepositoryId: source.id,
      sourceOwner: owner,
      sourceRepository: name,
      destinationOrganizationId: destination.id,
      destinationOwner: body.owner,
      destinationRepository: body.name,
      actorId: principal.id
    },
    { attempts: 2, timeoutMs: 120_000 }
  ).catch(() => new Response(null, { status: 502 }));
  if (!copied.ok) {
    await env.DB.prepare('DELETE FROM repositories WHERE id=?').bind(id).run();
    return problem(502, 'repository_fork_failed', 'Repository storage could not be forked safely.');
  }
  return json(
    {
      repository: {
        id,
        owner: body.owner,
        name: body.name,
        description: source.description,
        iconUrl: null,
        visibility: source.visibility,
        defaultBranch: source.defaultBranch,
        upstream: { owner, name },
        starred: false,
        starCount: 0,
        forkCount: 0,
        updatedAt: new Date().toISOString()
      }
    },
    { status: 201 }
  );
}

export async function detachRepositoryFork(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!repository.forkedFromRepositoryId) return problem(409, 'not_a_fork', 'This repository is not part of a fork network.');
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'identity_confirmation_required', 'Confirm your identity before detaching this fork.');
  await env.DB.batch([
    env.DB.prepare(`WITH RECURSIVE descendants(id) AS (SELECT ? UNION ALL SELECT repositories.id FROM repositories JOIN descendants ON repositories.forked_from_repository_id=descendants.id) UPDATE repositories SET fork_root_repository_id=? WHERE id IN (SELECT id FROM descendants)`).bind(repository.id, repository.id),
    env.DB.prepare('UPDATE repositories SET forked_from_repository_id=NULL,fork_root_repository_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(repository.id),
    auditStatement(env, {
      organizationId: repository.organizationId,
      repositoryId: repository.id,
      actor: principal,
      action: 'repository.fork.detached',
      subjectType: 'repository',
      subjectId: repository.id
    })
  ]);
  return json({ detached: true });
}

export async function getRepositorySettings(env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.maintain');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  const organizations = await env.DB.prepare(`SELECT organizations.slug,organizations.name FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organization_members.user_id=? AND organization_members.role='owner' ORDER BY organizations.slug`).bind(principal.id).all<{ slug: string; name: string }>();
  const upstream = access.forkedFromRepositoryId ? await env.DB.prepare('SELECT organizations.slug AS owner,repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=?').bind(access.forkedFromRepositoryId).first<{ owner: string; name: string }>() : null;
  return json({
    repository: { ...access, upstream },
    organizations: organizations.results
  });
}

export async function updateRepositorySettings(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, repositorySettingsBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const description = body.description ?? access.description;
  const visibility = body.visibility ?? access.visibility;
  const defaultBranch = body.defaultBranch ?? access.defaultBranch;
  if (typeof description !== 'string' || description.length > 280 || !validVisibility(visibility) || typeof defaultBranch !== 'string' || !validBranchName(defaultBranch)) return problem(422, 'invalid_repository_settings', 'Repository settings are invalid.');
  if (defaultBranch !== access.defaultBranch) {
    const branch = await env.DB.prepare('SELECT 1 AS found FROM branches WHERE repository_id=? AND name=?').bind(access.id, defaultBranch).first();
    if (!branch) return problem(422, 'branch_not_found', 'The default branch must exist in this repository.');
  }
  const archivedAt = typeof body.archived === 'boolean' ? (body.archived ? new Date().toISOString() : null) : access.archivedAt;
  await env.DB.batch([
    env.DB.prepare('UPDATE repositories SET description=?,visibility=?,default_branch=?,archived_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(description, visibility, defaultBranch, archivedAt, access.id),
    auditStatement(env, {
      organizationId: access.organizationId,
      repositoryId: access.id,
      actor: principal,
      action: 'repository.settings.updated',
      subjectType: 'repository',
      subjectId: access.id,
      details: {
        descriptionChanged: description !== access.description,
        visibility: { from: access.visibility, to: visibility },
        defaultBranch: { from: access.defaultBranch, to: defaultBranch },
        archived: Boolean(archivedAt)
      }
    })
  ]);
  return json({
    repository: {
      ...access,
      description,
      visibility,
      defaultBranch,
      archivedAt
    }
  });
}

export async function renameRepository(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'identity_confirmation_required', 'Confirm your identity before renaming this repository.');
  const body = await readJson(request, renameRepositoryBody);
  if (!body || !validSlug(body.name)) return problem(422, 'invalid_repository_name', 'Repository names must be URL-safe slugs.');
  const moved = await relocateStorage(env, owner, name, owner, body.name);
  if (!moved.ok) return problem(502, 'repository_storage_move_failed', 'Repository storage could not be renamed safely.');
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE repositories SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.name, access.id),
      auditStatement(env, {
        organizationId: access.organizationId,
        repositoryId: access.id,
        actor: principal,
        action: 'repository.renamed',
        subjectType: 'repository',
        subjectId: access.id,
        details: { from: name, to: body.name }
      })
    ]);
  } catch (error) {
    await relocateStorage(env, owner, body.name, owner, name);
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'repository_exists', 'A repository with this name already exists.');
    throw error;
  }
  return json({ repository: { owner, name: body.name } });
}

export async function transferRepository(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'identity_confirmation_required', 'Confirm your identity before transferring this repository.');
  const body = await readJson(request, transferRepositoryBody);
  if (!body || !validIdentitySlug(body.owner)) return problem(422, 'invalid_owner', 'Choose a valid destination owner.');
  const destination = await env.DB.prepare(`SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organizations.slug=? COLLATE NOCASE AND organization_members.user_id=? AND organization_members.role='owner'`).bind(body.owner, principal.id).first<{ id: string }>();
  if (!destination) return problem(403, 'destination_owner_required', 'You must own the destination organization.');
  const moved = await relocateStorage(env, owner, name, body.owner, name);
  if (!moved.ok) return problem(502, 'repository_storage_move_failed', 'Repository storage could not be transferred safely.');
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE repositories SET organization_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(destination.id, access.id),
      auditStatement(env, {
        organizationId: access.organizationId,
        repositoryId: access.id,
        actor: principal,
        action: 'repository.transferred',
        subjectType: 'repository',
        subjectId: access.id,
        details: { from: owner, to: body.owner }
      })
    ]);
  } catch (error) {
    await relocateStorage(env, body.owner, name, owner, name);
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'repository_exists', 'The destination already has a repository with this name.');
    throw error;
  }
  return json({ repository: { owner: body.owner, name } });
}

export async function scheduleRepositoryDeletion(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'identity_confirmation_required', 'Confirm your identity before deleting this repository.');
  const body = await readJson(request, deleteRepositoryBody);
  if (!body || body.confirmation !== `${owner}/${name}`) return problem(422, 'confirmation_mismatch', 'Type the full repository name to confirm deletion.');
  const deletionScheduledAt = new Date(Date.now() + 30 * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE repositories SET deletion_scheduled_at=?,archived_at=COALESCE(archived_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(deletionScheduledAt, access.id),
    auditStatement(env, {
      organizationId: access.organizationId,
      repositoryId: access.id,
      actor: principal,
      action: 'repository.deletion_scheduled',
      subjectType: 'repository',
      subjectId: access.id,
      details: { deletionScheduledAt }
    })
  ]);
  return json({ deletionScheduledAt });
}

function relocateStorage(env: Env, oldOwner: string, oldRepository: string, newOwner: string, newRepository: string) {
  return requestGitGateway(env, '/_marl/repositories/relocate', { oldOwner, oldRepository, newOwner, newRepository }, { attempts: 2, timeoutMs: 30_000 }).catch(() => new Response(null, { status: 502 }));
}

export async function listBranches(env: Env, principal: Principal | null, owner: string, name: string): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const result = await env.DB.prepare(`SELECT branches.name, branches.commit_id AS commitId, commits.title, branches.updated_at AS updatedAt FROM branches JOIN commits ON commits.repository_id = branches.repository_id AND commits.id = branches.commit_id WHERE branches.repository_id = ? ORDER BY branches.name`).bind(repo.id).all();
  return json({ defaultBranch: repo.defaultBranch, branches: result.results });
}

export async function listPullSources(env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const target = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!target) return problem(404, 'repository_not_found', 'Repository not found.');
  const rootId = target.forkRootRepositoryId ?? target.id;
  const targetBranches = await env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? ORDER BY name').bind(target.id).all<{ name: string; commitId: string }>();
  const candidates = await env.DB.prepare(`SELECT repositories.id,organizations.slug AS owner,repositories.name,repositories.default_branch AS defaultBranch FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE COALESCE(repositories.fork_root_repository_id,repositories.id)=? AND repositories.deletion_scheduled_at IS NULL ORDER BY CASE WHEN repositories.id=? THEN 0 ELSE 1 END,organizations.slug,repositories.name`).bind(rootId, target.id).all<{ id: string; owner: string; name: string; defaultBranch: string }>();
  const sources = [];
  for (const candidate of candidates.results) {
    const capability = candidate.id === target.id ? 'repository.triage' : 'repository.push';
    if (!(await authorizeRepositoryId(env, principal, candidate.id, capability))) continue;
    const branches = await env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? ORDER BY name').bind(candidate.id).all<{ name: string; commitId: string }>();
    sources.push({
      owner: candidate.owner,
      name: candidate.name,
      defaultBranch: candidate.defaultBranch,
      branches: branches.results
    });
  }
  return json({
    target: {
      owner,
      name,
      defaultBranch: target.defaultBranch,
      branches: targetBranches.results
    },
    sources
  });
}

export async function listCommits(env: Env, principal: Principal | null, owner: string, name: string, url: URL): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const limit = pageSize(url, 50, 100);
  const cursor = readCursor(url);
  const revision = url.searchParams.get('revision') ?? repo.defaultBranch;
  const resolved = await resolveRevision(env, repo.id, revision);
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  const after = cursor ? 'WHERE (authoredAt<? OR (authoredAt=? AND id<?))' : '';
  const values = cursor ? [resolved.id, repo.id, repo.id, cursor.value, cursor.value, cursor.id, limit + 1] : [resolved.id, repo.id, repo.id, limit + 1];
  const result = await env.DB.prepare(`WITH RECURSIVE history(id) AS (SELECT ? UNION SELECT json_each.value FROM history JOIN commits ON commits.repository_id=? AND commits.id=history.id JOIN json_each(commits.parent_ids)), commit_rows AS (SELECT commits.*,${commitAuthorIdSql()} AS matched_author_id FROM commits), ordered AS (SELECT commit_rows.id,substr(commit_rows.id,1,7) AS shortId,commit_rows.title,commit_rows.author_name AS author,commit_authors.handle AS authorHandle,commit_authors.display_name AS authorDisplayName,commit_authors.avatar_url AS authorAvatarUrl,commit_rows.authored_at AS authoredAt,commit_rows.signature_status AS signatureStatus,COUNT(*) OVER () AS total FROM commit_rows JOIN history ON history.id=commit_rows.id LEFT JOIN users AS commit_authors ON commit_authors.id=commit_rows.matched_author_id WHERE commit_rows.repository_id=?) SELECT * FROM ordered ${after} ORDER BY authoredAt DESC,id DESC LIMIT ?`)
    .bind(...values)
    .all<{
      id: string;
      shortId: string;
      title: string;
      author: string;
      authorHandle: string | null;
      authorDisplayName: string | null;
      authorAvatarUrl: string | null;
      authoredAt: string;
      signatureStatus: string;
      total: number;
    }>();
  const total = result.results[0]?.total ?? 0;
  const page = pageResult(result.results, limit, (commit) => ({
    value: commit.authoredAt,
    id: commit.id
  }));
  return json({
    commits: page.items.map(({ total: _, ...commit }) => commit),
    total,
    nextCursor: page.nextCursor
  });
}

export async function getCommit(env: Env, principal: Principal | null, owner: string, name: string, commitId: string): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!/^[0-9a-f]{40,64}$/.test(commitId)) return problem(422, 'invalid_commit', 'Commit identifier is invalid.');
  const indexed = await env.DB.prepare(`WITH commit_row AS (SELECT commits.*,${commitAuthorIdSql()} AS matched_author_id FROM commits WHERE commits.repository_id=? AND commits.id=?) SELECT commit_row.id,commit_row.signature_status AS signatureStatus,commit_authors.handle AS authorHandle,commit_authors.display_name AS authorDisplayName,commit_authors.avatar_url AS authorAvatarUrl FROM commit_row LEFT JOIN users AS commit_authors ON commit_authors.id=commit_row.matched_author_id`).bind(repo.id, commitId).first<{
    id: string;
    signatureStatus: string;
    authorHandle: string | null;
    authorDisplayName: string | null;
    authorAvatarUrl: string | null;
  }>();
  if (!indexed) return problem(404, 'commit_not_found', 'Commit not found.');
  const response = await requestGitGateway(env, '/_marl/commit', { owner, repository: name, commitId }, { attempts: 2 });
  if (!response.ok) return problem(502, 'commit_gateway_failed', 'Git gateway could not read this commit.');
  const commit = await readJsonValue<{ author?: string; authorEmail?: string }>(response, 16 * 1024 * 1024);
  if (!commit || typeof commit.author !== 'string') return problem(502, 'commit_gateway_failed', 'Git gateway returned invalid commit data.');
  return json({
    ...commit,
    signatureStatus: indexed.signatureStatus,
    authorHandle: indexed.authorHandle,
    authorDisplayName: indexed.authorDisplayName,
    authorAvatarUrl: indexed.authorAvatarUrl
  });
}

export async function readCommitPatch(env: Env, principal: Principal | null, owner: string, name: string, commitId: string, url: URL): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const path = url.searchParams.get('path') ?? '';
  if (!safeRepositoryPath(path)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  const resolved = await resolveRevision(env, repo.id, commitId);
  if (!resolved) return problem(404, 'commit_not_found', 'Commit not found.');
  const commit = await env.DB.prepare('SELECT parent_ids AS parentIds FROM commits WHERE repository_id=? AND id=?').bind(repo.id, resolved.id).first<{ parentIds: string }>();
  let parents: unknown = [];
  try {
    parents = JSON.parse(commit?.parentIds ?? '[]');
  } catch {
    return problem(500, 'commit_metadata_invalid', 'Stored commit metadata is invalid.');
  }
  const base = Array.isArray(parents) && typeof parents[0] === 'string' ? parents[0] : '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const response = await requestGitGateway(env, '/_marl/patch', { owner, repository: name, base, head: resolved.id, path }, { attempts: 2 }).catch(() => null);
  if (!response?.ok) return problem(502, 'patch_gateway_failed', 'Git gateway could not read this file diff.');
  return new Response(response.body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export async function listTree(env: Env, principal: Principal | null, owner: string, name: string, url: URL): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const revision = url.searchParams.get('revision') ?? repo.defaultBranch;
  const parentPath = url.searchParams.get('path') ?? '';
  const query = url.searchParams.get('query')?.trim() ?? '';
  if (parentPath && !safeRepositoryPath(parentPath)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  if (query.length > 120) return problem(422, 'invalid_query', 'File search is too long.');
  const resolved = await resolveRevision(env, repo.id, revision);
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  const indexed = query ? await env.DB.prepare("SELECT path, name, kind, object_id AS objectId, byte_size AS byteSize FROM repository_entries WHERE repository_id = ? AND tree_id = ? AND instr(lower(path), lower(?)) > 0 ORDER BY CASE kind WHEN 'tree' THEN 0 ELSE 1 END, path COLLATE NOCASE LIMIT 100").bind(repo.id, resolved.treeId, query).all() : await env.DB.prepare("SELECT path, name, kind, object_id AS objectId, byte_size AS byteSize FROM repository_entries WHERE repository_id = ? AND tree_id = ? AND parent_path = ? ORDER BY CASE kind WHEN 'tree' THEN 0 ELSE 1 END, name COLLATE NOCASE").bind(repo.id, resolved.treeId, parentPath).all();
  let entries = indexed.results;
  if (!query && entries.length === 0) {
    const historical = await readGatewayTree(env, owner, name, resolved.id, parentPath);
    if (!historical) return problem(502, 'tree_gateway_failed', 'Git gateway could not read this repository tree.');
    entries = historical;
  }
  const paths = entries.map((entry) => entry.path).filter((path): path is string => typeof path === 'string');
  const lastChanges = paths.length
    ? await env.DB.prepare(`WITH RECURSIVE history(id) AS (SELECT ? UNION SELECT json_each.value FROM history JOIN commits ON commits.repository_id=? AND commits.id=history.id JOIN json_each(commits.parent_ids)), ranked AS (SELECT commit_changes.path,commits.id AS commitId,commits.title AS message,commits.author_name AS author,commits.authored_at AS updatedAt,ROW_NUMBER() OVER (PARTITION BY commit_changes.path ORDER BY commit_changes.position DESC,commits.authored_at DESC,commits.id) AS rank FROM commit_changes JOIN history ON history.id=commit_changes.commit_id JOIN commits ON commits.repository_id=commit_changes.repository_id AND commits.id=commit_changes.commit_id JOIN json_each(?) requested ON requested.value=commit_changes.path WHERE commit_changes.repository_id=?) SELECT path,commitId,message,author,updatedAt FROM ranked WHERE rank=1`).bind(resolved.id, repo.id, JSON.stringify(paths), repo.id).all<{
        path: string;
        commitId: string;
        message: string;
        author: string;
        updatedAt: string;
      }>()
    : { results: [] };
  const metadata = new Map(lastChanges.results.map((change) => [change.path, change]));
  return json({
    revision,
    path: parentPath,
    commit: {
      id: resolved.id,
      shortId: resolved.id.slice(0, 7),
      title: resolved.title,
      author: resolved.author,
      authorHandle: resolved.authorHandle,
      authorDisplayName: resolved.authorDisplayName,
      authorAvatarUrl: resolved.authorAvatarUrl,
      authoredAt: resolved.authoredAt,
      signatureStatus: resolved.signatureStatus
    },
    entries: entries.map((entry) => ({
      ...entry,
      ...metadata.get(entry.path as string)
    }))
  });
}

export async function readBlob(env: Env, principal: Principal | null, owner: string, name: string, revision: string, path: string, ctx: ExecutionContext): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!safeRepositoryPath(path)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  const resolved = await resolveRevision(env, repo.id, revision);
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  let entry = await env.DB.prepare(`SELECT object_id AS objectId FROM repository_entries WHERE repository_id=? AND tree_id=? AND path=? AND kind='blob'`).bind(repo.id, resolved.treeId, path).first<{ objectId: string }>();
  if (!entry?.objectId) {
    const parentPath = path.split('/').slice(0, -1).join('/');
    const historical = await readGatewayTree(env, owner, name, resolved.id, parentPath);
    if (!historical) return problem(502, 'tree_gateway_failed', 'Git gateway could not resolve this historical file.');
    entry = historical.find((candidate) => candidate.path === path && candidate.kind === 'blob') ?? null;
  }
  if (!entry?.objectId) return problem(404, 'blob_not_found', 'File not found at this revision.');
  const immutableRevision = revision.toLowerCase() === resolved.id.toLowerCase();
  const cacheKey = new Request(`https://blob-cache.marl.internal/v2/${repo.id}/${entry.objectId}/${encodeURIComponent(path)}`);
  const publicCache = (caches as unknown as { default: Cache }).default;
  if (repo.visibility === 'public') {
    const cached = await publicCache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('cache-control', immutableRevision ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
  }
  const response = await (env.ENVIRONMENT === 'development' ? requestGitGateway(env, '/_marl/blob', { owner, repository: name, objectId: entry.objectId }, { attempts: 3 }) : requestGitGateway(env, '/_marl/object', { repositoryId: repo.id, objectId: entry.objectId }, { attempts: 3 })).catch(() => null);
  if (!response?.ok || !response.body || response.headers.get('x-marl-git-object-type') !== 'blob') return problem(502, 'blob_gateway_failed', 'Git storage could not read this file.');
  const result = new Response(response.body, {
    headers: rawBlobHeaders(path, repo.visibility, response.headers.get('content-length'), immutableRevision)
  });
  if (repo.visibility === 'public') {
    const cached = result.clone();
    cached.headers.set('cache-control', 'public, max-age=31536000, immutable');
    ctx.waitUntil(publicCache.put(cacheKey, cached));
  }
  return result;
}

type TreeEntry = {
  path: string;
  name: string;
  kind: string;
  objectId: string;
  byteSize?: number;
};

async function readGatewayTree(env: Env, owner: string, repository: string, commitId: string, path: string): Promise<TreeEntry[] | null> {
  const response = await requestGitGateway(env, '/_marl/tree', { owner, repository, commitId, path }, { attempts: 2 }).catch(() => null);
  if (!response?.ok) return null;
  const body = await readJsonValue<{ entries?: TreeEntry[] }>(response, 16 * 1024 * 1024);
  if (!Array.isArray(body?.entries)) return null;
  return body.entries.filter((entry) => entry && typeof entry.path === 'string' && safeRepositoryPath(entry.path) && typeof entry.name === 'string' && ['tree', 'blob'].includes(entry.kind) && typeof entry.objectId === 'string' && /^[0-9a-f]{40,64}$/.test(entry.objectId));
}

async function resolveRevision(
  env: Env,
  repositoryId: string,
  revision: string
): Promise<{
  id: string;
  treeId: string;
  title: string;
  author: string;
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  authoredAt: string;
  signatureStatus: string;
} | null> {
  return env.DB.prepare(`WITH commit_row AS (SELECT commits.*,${commitAuthorIdSql()} AS matched_author_id FROM commits WHERE commits.repository_id=? AND commits.id=COALESCE((SELECT commit_id FROM branches WHERE repository_id=? AND name=?),?)) SELECT commit_row.id,commit_row.tree_id AS treeId,commit_row.title,commit_row.author_name AS author,commit_authors.handle AS authorHandle,commit_authors.display_name AS authorDisplayName,commit_authors.avatar_url AS authorAvatarUrl,commit_row.authored_at AS authoredAt,commit_row.signature_status AS signatureStatus FROM commit_row LEFT JOIN users AS commit_authors ON commit_authors.id=commit_row.matched_author_id`).bind(repositoryId, repositoryId, revision, revision).first<{
    id: string;
    treeId: string;
    title: string;
    author: string;
    authorHandle: string | null;
    authorDisplayName: string | null;
    authorAvatarUrl: string | null;
    authoredAt: string;
    signatureStatus: string;
  }>();
}

function placeholders(values: readonly unknown[]) {
  return values.map(() => '?').join(',');
}

async function queryInChunks<T>(values: string[], size: number, query: (chunk: string[]) => Promise<D1Result<T>>) {
  const rows: T[] = [];
  for (let offset = 0; offset < values.length; offset += size) rows.push(...(await query(values.slice(offset, offset + size))).results);
  return rows;
}
