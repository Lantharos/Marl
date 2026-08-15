import type { RepositorySummary } from '@sty/contracts';
import type { Principal } from './auth';
import { identifier, safeRepositoryPath, validBranchName, validSlug, validVisibility } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { queuePushWorkflows } from './workflows';

type RepositoryRow = RepositorySummary & { organizationId: string; defaultBranch: string; };

const selectRepository = `SELECT repositories.id, organizations.slug AS owner, repositories.name, repositories.description, repositories.visibility, repositories.default_branch AS defaultBranch, repositories.updated_at AS updatedAt, repositories.organization_id AS organizationId FROM repositories JOIN organizations ON organizations.id = repositories.organization_id`;

async function repository(env: Env, owner: string, name: string): Promise<RepositoryRow | null> {
  return env.DB.prepare(`${selectRepository} WHERE organizations.slug = ? COLLATE NOCASE AND repositories.name = ? COLLATE NOCASE`).bind(owner, name).first<RepositoryRow>();
}

async function canRead(env: Env, principal: Principal, repo: RepositoryRow): Promise<boolean> {
  if (repo.visibility === 'public') return true;
  return Boolean(await env.DB.prepare('SELECT 1 AS allowed FROM organization_members WHERE organization_id = ? AND user_id = ?').bind(repo.organizationId, principal.id).first());
}

export async function authorizeGit(env: Env, principal: Principal | null, owner: string, name: string, service: string, gatewayTrusted = false): Promise<Response> {
  const repo = await repository(env, owner, name);
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const membership = principal ? await env.DB.prepare('SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?').bind(repo.organizationId, principal.id).first<{ role: 'owner' | 'member' }>() : null;
  const read = gatewayTrusted || repo.visibility === 'public' || Boolean(membership);
  const write = (gatewayTrusted || Boolean(membership)) && (service === 'git-receive-pack');
  if (!read || (service === 'git-receive-pack' && !write)) return problem(principal ? 403 : 401, 'git_access_denied', 'You do not have access to this repository.');
  return json({ repositoryId: repo.id, organizationId: repo.organizationId, visibility: repo.visibility, read, write });
}

export async function indexGit(request: Request, env: Env, principal: Principal | null, gatewayTrusted = false): Promise<Response> {
  const body = await readJson(request);
  if (!body || typeof body.repositoryId !== 'string' || !Array.isArray(body.commits) || !Array.isArray(body.branches) || !Array.isArray(body.entries)) return problem(422, 'invalid_git_index', 'Git index payload is invalid.');
  const owned = gatewayTrusted || (principal && await env.DB.prepare(`SELECT repositories.id FROM repositories JOIN organization_members ON organization_members.organization_id = repositories.organization_id WHERE repositories.id = ? AND organization_members.user_id = ?`).bind(body.repositoryId, principal.id).first());
  if (!owned) return problem(403, 'git_access_denied', 'You cannot index this repository.');
  const previous = await env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=?').bind(body.repositoryId).all<{ name: string; commitId: string }>();
  const previousHeads = new Map(previous.results.map((branch) => [branch.name, branch.commitId]));
  const statements = [];
  for (const value of body.commits.slice(0, 5000)) {
    if (!value || typeof value !== 'object') continue;
    const commit = value as Record<string, unknown>;
    if (![commit.id, commit.title, commit.author, commit.authoredAt, commit.treeId].every((field) => typeof field === 'string') || !Array.isArray(commit.parents) || !commit.parents.every((parent) => typeof parent === 'string' && /^[0-9a-f]{40,64}$/.test(parent))) continue;
    statements.push(env.DB.prepare(`INSERT INTO commits (repository_id, id, title, author_name, author_email, authored_at, tree_id, parent_ids) VALUES (?, ?, ?, ?, '', ?, ?, ?) ON CONFLICT(repository_id, id) DO UPDATE SET title=excluded.title, author_name=excluded.author_name, authored_at=excluded.authored_at, tree_id=excluded.tree_id, parent_ids=excluded.parent_ids`).bind(body.repositoryId, commit.id, commit.title, commit.author, commit.authoredAt, commit.treeId, JSON.stringify(commit.parents)));
  }
  const indexedBranches: Array<{ name: string; commitId: string }> = [];
  for (const value of body.branches.slice(0, 1000)) {
    if (!value || typeof value !== 'object') continue;
    const branch = value as Record<string, unknown>;
    if (typeof branch.name !== 'string' || !validBranchName(branch.name) || typeof branch.commitId !== 'string' || !/^[0-9a-f]{40,64}$/.test(branch.commitId)) continue;
    indexedBranches.push({ name: branch.name, commitId: branch.commitId });
    statements.push(env.DB.prepare(`INSERT INTO branches (repository_id, name, commit_id) VALUES (?, ?, ?) ON CONFLICT(repository_id, name) DO UPDATE SET commit_id=excluded.commit_id, updated_at=CURRENT_TIMESTAMP`).bind(body.repositoryId, branch.name, branch.commitId));
    statements.push(env.DB.prepare(`UPDATE pull_requests SET source_commit_id = ?, updated_at = CURRENT_TIMESTAMP WHERE repository_id = ? AND source_branch = ? AND state IN ('draft', 'open') AND source_commit_id != ?`).bind(branch.commitId, body.repositoryId, branch.name, branch.commitId));
    statements.push(env.DB.prepare(`UPDATE pull_requests SET target_commit_id = ?, updated_at = CURRENT_TIMESTAMP WHERE repository_id = ? AND target_branch = ? AND state IN ('draft', 'open') AND target_commit_id != ?`).bind(branch.commitId, body.repositoryId, branch.name, branch.commitId));
  }
  for (const value of body.entries.slice(0, 25000)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    if (![entry.treeId, entry.path, entry.parentPath, entry.name, entry.kind, entry.objectId].every((field) => typeof field === 'string')) continue;
    statements.push(env.DB.prepare(`INSERT INTO repository_entries (repository_id, tree_id, path, parent_path, name, kind, object_id, byte_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(repository_id, tree_id, path) DO UPDATE SET kind=excluded.kind, object_id=excluded.object_id, byte_size=excluded.byte_size`).bind(body.repositoryId, entry.treeId, entry.path, entry.parentPath, entry.name, entry.kind, entry.objectId, typeof entry.byteSize === 'number' ? entry.byteSize : null));
  }
  if (typeof body.defaultBranch === 'string') statements.push(env.DB.prepare('UPDATE repositories SET default_branch = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(body.defaultBranch, body.repositoryId));
  for (let offset = 0; offset < statements.length; offset += 100) await env.DB.batch(statements.slice(offset, offset + 100));
  if (indexedBranches.length) {
    const placeholders = indexedBranches.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM branches WHERE repository_id=? AND name NOT IN (${placeholders})`).bind(body.repositoryId, ...indexedBranches.map((branch) => branch.name)).run();
  } else {
    await env.DB.prepare('DELETE FROM branches WHERE repository_id=?').bind(body.repositoryId).run();
  }
  const actorId = principal?.id ?? (await env.DB.prepare('SELECT created_by AS createdBy FROM repositories WHERE id=?').bind(body.repositoryId).first<{ createdBy: string }>())?.createdBy ?? null;
  const trees = new Map(body.commits.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object')).map((commit) => [commit.id, commit.treeId]));
  let workflowsQueued = 0;
  const workflowWarnings = [];
  for (const branch of indexedBranches.filter((item) => previousHeads.get(item.name) !== item.commitId)) {
    const treeId = trees.get(branch.commitId);
    if (typeof treeId !== 'string') continue;
    const result = await queuePushWorkflows(env, body.repositoryId, branch.name, branch.commitId, treeId, actorId);
    workflowsQueued += result.queued;
    workflowWarnings.push(...result.warnings);
  }
  return json({ indexed: { commits: body.commits.length, branches: indexedBranches.length, entries: body.entries.length }, workflows: { queued: workflowsQueued, warnings: workflowWarnings } });
}

export async function listRepositories(env: Env, principal: Principal): Promise<Response> {
  const result = await env.DB.prepare(`${selectRepository} JOIN organization_members ON organization_members.organization_id = repositories.organization_id WHERE organization_members.user_id = ? ORDER BY repositories.updated_at DESC LIMIT 100`).bind(principal.id).all<RepositoryRow>();
  return json({ repositories: result.results.map(({ organizationId: _, defaultBranch: __, ...repo }) => repo) });
}

export async function createRepository(request: Request, env: Env, principal: Principal): Promise<Response> {
  const body = await readJson(request);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const { owner, name, description = '', visibility = 'private' } = body;
  if (!validSlug(owner) || !validSlug(name)) return problem(422, 'invalid_repository_name', 'Owner and repository names must be URL-safe slugs.');
  if (typeof description !== 'string' || description.length > 280 || !validVisibility(visibility)) return problem(422, 'invalid_repository', 'Description or visibility is invalid.');
  const organization = await env.DB.prepare(`SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id = organizations.id WHERE organizations.slug = ? COLLATE NOCASE AND organization_members.user_id = ? AND organization_members.role = 'owner'`).bind(owner, principal.id).first<{ id: string }>();
  if (!organization) return problem(403, 'owner_required', 'You cannot create repositories for this owner.');
  const id = identifier('repo');
  try {
    await env.DB.prepare('INSERT INTO repositories (id, organization_id, name, description, visibility, created_by) VALUES (?, ?, ?, ?, ?, ?)').bind(id, organization.id, name, description, visibility, principal.id).run();
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'repository_exists', 'A repository with this name already exists.');
    throw error;
  }
  return json({ repository: { id, owner, name, description, visibility, updatedAt: new Date().toISOString() } }, { status: 201 });
}

export async function getRepository(env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repo = await repository(env, owner, name);
  if (!repo || !(await canRead(env, principal, repo))) return problem(404, 'repository_not_found', 'Repository not found.');
  const { organizationId: _, ...visible } = repo;
  return json({ repository: { ...visible, cloneUrl: `${env.GIT_PUBLIC_URL ?? env.GIT_GATEWAY_URL}/${owner}/${name}.git` } });
}

export async function listBranches(env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repo = await repository(env, owner, name);
  if (!repo || !(await canRead(env, principal, repo))) return problem(404, 'repository_not_found', 'Repository not found.');
  const result = await env.DB.prepare(`SELECT branches.name, branches.commit_id AS commitId, commits.title, branches.updated_at AS updatedAt FROM branches JOIN commits ON commits.repository_id = branches.repository_id AND commits.id = branches.commit_id WHERE branches.repository_id = ? ORDER BY branches.name`).bind(repo.id).all();
  return json({ defaultBranch: repo.defaultBranch, branches: result.results });
}

export async function listCommits(env: Env, principal: Principal, owner: string, name: string, url: URL): Promise<Response> {
  const repo = await repository(env, owner, name);
  if (!repo || !(await canRead(env, principal, repo))) return problem(404, 'repository_not_found', 'Repository not found.');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 100);
  const revision = url.searchParams.get('revision') ?? repo.defaultBranch;
  const resolved = await resolveRevision(env, repo.id, revision);
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  const result = await env.DB.prepare(`WITH RECURSIVE history(id) AS (SELECT ? UNION SELECT json_each.value FROM history JOIN commits ON commits.repository_id = ? AND commits.id = history.id JOIN json_each(commits.parent_ids)) SELECT commits.id, substr(commits.id, 1, 7) AS shortId, commits.title, commits.author_name AS author, commits.authored_at AS authoredAt, commits.signature_status AS signatureStatus FROM commits JOIN history ON history.id = commits.id WHERE commits.repository_id = ? ORDER BY commits.authored_at DESC LIMIT ?`).bind(resolved.id, repo.id, repo.id, limit).all();
  return json({ commits: result.results });
}

export async function getCommit(env: Env, principal: Principal, owner: string, name: string, commitId: string): Promise<Response> {
  const repo = await repository(env, owner, name);
  if (!repo || !(await canRead(env, principal, repo))) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!/^[0-9a-f]{40,64}$/.test(commitId)) return problem(422, 'invalid_commit', 'Commit identifier is invalid.');
  const indexed = await env.DB.prepare('SELECT id FROM commits WHERE repository_id=? AND id=?').bind(repo.id, commitId).first();
  if (!indexed) return problem(404, 'commit_not_found', 'Commit not found.');
  const response = await fetch(`${env.GIT_GATEWAY_URL}/_sty/commit`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sty-gateway-token': env.GIT_GATEWAY_TOKEN ?? 'sty-local' }, body: JSON.stringify({ owner, repository: name, commitId }) });
  if (!response.ok) return problem(502, 'commit_gateway_failed', 'Git gateway could not read this commit.');
  return new Response(response.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': repo.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store' } });
}

export async function listTree(env: Env, principal: Principal, owner: string, name: string, url: URL): Promise<Response> {
  const repo = await repository(env, owner, name);
  if (!repo || !(await canRead(env, principal, repo))) return problem(404, 'repository_not_found', 'Repository not found.');
  const revision = url.searchParams.get('revision') ?? repo.defaultBranch;
  const parentPath = url.searchParams.get('path') ?? '';
  const query = url.searchParams.get('query')?.trim() ?? '';
  if (parentPath && !safeRepositoryPath(parentPath)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  if (query.length > 120) return problem(422, 'invalid_query', 'File search is too long.');
  const resolved = await resolveRevision(env, repo.id, revision);
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  const result = query
    ? await env.DB.prepare('SELECT path, name, kind, object_id AS objectId, byte_size AS byteSize FROM repository_entries WHERE repository_id = ? AND tree_id = ? AND instr(lower(path), lower(?)) > 0 ORDER BY CASE kind WHEN \'tree\' THEN 0 ELSE 1 END, path COLLATE NOCASE LIMIT 100').bind(repo.id, resolved.treeId, query).all()
    : await env.DB.prepare('SELECT path, name, kind, object_id AS objectId, byte_size AS byteSize FROM repository_entries WHERE repository_id = ? AND tree_id = ? AND parent_path = ? ORDER BY CASE kind WHEN \'tree\' THEN 0 ELSE 1 END, name COLLATE NOCASE').bind(repo.id, resolved.treeId, parentPath).all();
  return json({ revision, path: parentPath, commit: { id: resolved.id, shortId: resolved.id.slice(0, 7), title: resolved.title, author: resolved.author, authoredAt: resolved.authoredAt, signatureStatus: resolved.signatureStatus }, entries: result.results });
}

export async function readBlob(env: Env, principal: Principal, owner: string, name: string, revision: string, path: string): Promise<Response> {
  const repo = await repository(env, owner, name);
  if (!repo || !(await canRead(env, principal, repo))) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!safeRepositoryPath(path)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  const resolved = await resolveRevision(env, repo.id, revision);
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  const entry = await env.DB.prepare(`SELECT object_id AS objectId FROM repository_entries WHERE repository_id=? AND tree_id=? AND path=? AND kind='blob'`).bind(repo.id, resolved.treeId, path).first<{ objectId: string }>();
  if (!entry?.objectId) return problem(404, 'blob_not_found', 'File not found at this revision.');
  const response = await fetch(`${env.GIT_GATEWAY_URL}/_sty/blob`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sty-gateway-token': env.GIT_GATEWAY_TOKEN ?? 'sty-local' }, body: JSON.stringify({ owner, repository: name, objectId: entry.objectId }) }).catch(() => null);
  if (!response?.ok || !response.body) return problem(502, 'blob_gateway_failed', 'Git gateway could not read this file.');
  return new Response(response.body, { headers: { 'content-type': contentType(path), ...(response.headers.get('content-length') ? { 'content-length': response.headers.get('content-length')! } : {}), 'cache-control': repo.visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store' } });
}

function contentType(path: string) {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (['md', 'txt', 'rs', 'ts', 'tsx', 'js', 'jsx', 'svelte', 'toml', 'yaml', 'yml', 'css', 'html', 'json'].includes(extension ?? '')) return 'text/plain; charset=utf-8';
  if (extension === 'svg') return 'image/svg+xml';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

async function resolveRevision(env: Env, repositoryId: string, revision: string): Promise<{ id: string; treeId: string; title: string; author: string; authoredAt: string; signatureStatus: string } | null> {
  return env.DB.prepare(`SELECT id, tree_id AS treeId, title, author_name AS author, authored_at AS authoredAt, signature_status AS signatureStatus FROM commits WHERE repository_id=? AND id=COALESCE((SELECT commit_id FROM branches WHERE repository_id=? AND name=?),?)`).bind(repositoryId, repositoryId, revision, revision).first<{ id: string; treeId: string; title: string; author: string; authoredAt: string; signatureStatus: string }>();
}
