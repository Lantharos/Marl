import type { ReleaseDetail, ReleaseSummary, RepositoryTag } from '@marl/contracts';
import { auditStatement } from './audit';
import type { Principal } from './auth';
import { identifier, validTagName } from './domain';
import { requestGitGateway } from './git-gateway';
import { json, problem, readJson, readJsonValue } from './http';
import { pageResult, pageSize, readCursor } from './cursor';
import type { Env } from './platform';
import { authorizeRepository } from './repository-access';
import { createReleaseBody, updateReleaseBody } from './request-schemas';
import { deleteReleaseStorage, listReleaseAssets } from './release-assets';

type ReleaseRow = {
  id: string;
  repositoryId: string;
  owner: string;
  repository: string;
  tagName: string;
  targetCommitId: string;
  targetBranch: string | null;
  name: string;
  body: string;
  author: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  draft: number;
  prerelease: number;
  latest: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  assetCount: number;
};

const releaseSelect = (body = 'releases.body') => `SELECT releases.id,releases.repository_id AS repositoryId,organizations.slug AS owner,repositories.name AS repository,releases.tag_name AS tagName,releases.target_commit_id AS targetCommitId,releases.target_branch AS targetBranch,releases.name,${body} AS body,users.handle AS author,users.display_name AS authorDisplayName,users.avatar_url AS authorAvatarUrl,releases.draft,releases.prerelease,releases.latest,releases.created_at AS createdAt,releases.updated_at AS updatedAt,releases.published_at AS publishedAt,(SELECT COUNT(*) FROM release_assets WHERE release_assets.release_id=releases.id) AS assetCount FROM releases JOIN repositories ON repositories.id=releases.repository_id JOIN organizations ON organizations.id=repositories.organization_id JOIN users ON users.id=releases.author_id`;

export async function listReleases(env: Env, principal: Principal, owner: string, name: string, url: URL): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const canEdit = Boolean(await authorizeRepository(env, principal, owner, name, 'repository.push'));
  const limit = pageSize(url, 20, 100);
  const cursor = readCursor(url);
  const filters = ['releases.repository_id=?', ...(canEdit ? [] : ['releases.draft=0'])];
  const values: unknown[] = [repository.id];
  if (cursor) {
    filters.push('(COALESCE(releases.published_at,releases.created_at)<? OR (COALESCE(releases.published_at,releases.created_at)=? AND releases.id<?))');
    values.push(cursor.value, cursor.value, cursor.id);
  }
  const rows = await env.DB.prepare(`${releaseSelect('substr(releases.body,1,1000)')} WHERE ${filters.join(' AND ')} ORDER BY COALESCE(releases.published_at,releases.created_at) DESC,releases.id DESC LIMIT ?`)
    .bind(...values, limit + 1)
    .all<ReleaseRow>();
  const page = pageResult(rows.results, limit, (row) => ({
    value: row.publishedAt ?? row.createdAt,
    id: row.id
  }));
  return json({
    releases: page.items.map(summarize),
    nextCursor: page.nextCursor,
    canCreate: canEdit
  });
}

export async function getRelease(env: Env, principal: Principal, owner: string, name: string, releaseId: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const row = await env.DB.prepare(`${releaseSelect()} WHERE releases.repository_id=? AND releases.id=?`).bind(repository.id, releaseId).first<ReleaseRow>();
  if (!row) return problem(404, 'release_not_found', 'Release not found.');
  const canEdit = Boolean(await authorizeRepository(env, principal, owner, name, 'repository.push'));
  if (row.draft && !canEdit) return problem(404, 'release_not_found', 'Release not found.');
  const release: ReleaseDetail = {
    ...summarize(row),
    assets: await listReleaseAssets(env, row.id, canEdit),
    canEdit
  };
  return json({ release });
}

export async function getReleaseByTag(env: Env, principal: Principal, owner: string, name: string, url: URL): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const tag = url.searchParams.get('tag');
  if (!tag || !validTagName(tag)) return problem(422, 'invalid_release_tag', 'Choose a valid release tag.');
  const row = await env.DB.prepare(`${releaseSelect()} WHERE releases.repository_id=? AND releases.tag_name=?`).bind(repository.id, tag).first<ReleaseRow>();
  if (!row) return problem(404, 'release_not_found', 'Release not found.');
  const canEdit = Boolean(await authorizeRepository(env, principal, owner, name, 'repository.push'));
  if (row.draft && !canEdit) return problem(404, 'release_not_found', 'Release not found.');
  const release: ReleaseDetail = {
    ...summarize(row),
    assets: await listReleaseAssets(env, row.id, canEdit),
    canEdit
  };
  return json({ release });
}

export async function listRepositoryTags(env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  if (!(await authorizeRepository(env, principal, owner, name, 'repository.read'))) return problem(404, 'repository_not_found', 'Repository not found.');
  const response = await requestGitGateway(env, '/_marl/tags/list', { owner, repository: name }, { attempts: 2 });
  if (!response.ok) return problem(502, 'release_tags_unavailable', 'Repository tags could not be loaded.');
  const value = await readJsonValue<{ tags?: RepositoryTag[] }>(response, 1024 * 1024);
  if (!value?.tags || !Array.isArray(value.tags)) return problem(502, 'release_tags_invalid', 'Repository tags returned an invalid response.');
  return json({ tags: value.tags });
}

export async function createRelease(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.push');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, createReleaseBody);
  if (!body || !validTagName(body.tagName)) return problem(422, 'invalid_release', 'A valid tag and target are required.');
  const target = await resolveTarget(env, repository.id, body.target);
  if (!target) return problem(422, 'release_target_not_found', 'Choose an existing branch or full commit identifier.');
  const draft = body.draft ?? false;
  const prerelease = body.prerelease ?? false;
  const latest = !draft && !prerelease && (body.makeLatest ?? true);
  const id = identifier('release');
  const publishedAt = draft ? null : new Date().toISOString();
  if (!draft) {
    const tag = await ensureTag(env, owner, name, body.tagName, target.commitId, principal.id);
    if (tag) return tag;
  }
  const statements = [];
  if (latest) statements.push(env.DB.prepare('UPDATE releases SET latest=0,updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND latest=1').bind(repository.id));
  statements.push(
    env.DB.prepare('INSERT INTO releases (id,repository_id,tag_name,target_commit_id,target_branch,name,body,author_id,draft,prerelease,latest,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, repository.id, body.tagName, target.commitId, target.branch, body.name?.trim() ?? '', body.body ?? '', principal.id, draft ? 1 : 0, prerelease ? 1 : 0, latest ? 1 : 0, publishedAt),
    auditStatement(env, {
      organizationId: repository.organizationId,
      repositoryId: repository.id,
      actor: principal,
      action: draft ? 'release.drafted' : 'release.published',
      subjectType: 'release',
      subjectId: id,
      details: { tag: body.tagName, target: target.commitId }
    })
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'release_tag_exists', 'A release already uses this tag.');
    throw error;
  }
  return json({ release: { id, tagName: body.tagName, draft } }, { status: 201 });
}

export async function updateRelease(request: Request, env: Env, principal: Principal, owner: string, name: string, releaseId: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.push');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const current = await env.DB.prepare('SELECT id,tag_name AS tagName,target_commit_id AS targetCommitId,target_branch AS targetBranch,name,body,draft,prerelease,latest FROM releases WHERE repository_id=? AND id=?').bind(repository.id, releaseId).first<{
    id: string;
    tagName: string;
    targetCommitId: string;
    targetBranch: string | null;
    name: string;
    body: string;
    draft: number;
    prerelease: number;
    latest: number;
  }>();
  if (!current) return problem(404, 'release_not_found', 'Release not found.');
  const body = await readJson(request, updateReleaseBody);
  if (!body) return problem(422, 'invalid_release', 'Release details are invalid.');
  if (!current.draft && (body.tagName !== undefined || body.target !== undefined || body.draft === true)) return problem(409, 'published_release_immutable', 'A published release cannot change its tag or return to draft.');
  const tagName = body.tagName ?? current.tagName;
  if (!validTagName(tagName)) return problem(422, 'invalid_release_tag', 'Choose a valid Git tag.');
  const target = body.target ? await resolveTarget(env, repository.id, body.target) : { commitId: current.targetCommitId, branch: current.targetBranch };
  if (!target) return problem(422, 'release_target_not_found', 'Choose an existing branch or full commit identifier.');
  const draft = body.draft ?? Boolean(current.draft);
  const prerelease = body.prerelease ?? Boolean(current.prerelease);
  const publishing = Boolean(current.draft) && !draft;
  let targetCommitId = target.commitId;
  if (publishing && target.branch) {
    const refreshed = await resolveTarget(env, repository.id, target.branch);
    if (!refreshed) return problem(409, 'release_target_changed', 'The target branch no longer exists.');
    targetCommitId = refreshed.commitId;
  }
  if (publishing) {
    const tag = await ensureTag(env, owner, name, tagName, targetCommitId, principal.id);
    if (tag) return tag;
  }
  const latest = !draft && !prerelease && (body.makeLatest ?? (publishing ? true : Boolean(current.latest)));
  const statements = [];
  if (latest) statements.push(env.DB.prepare('UPDATE releases SET latest=0,updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND latest=1 AND id!=?').bind(repository.id, releaseId));
  statements.push(
    env.DB.prepare('UPDATE releases SET tag_name=?,target_commit_id=?,target_branch=?,name=?,body=?,draft=?,prerelease=?,latest=?,published_at=CASE WHEN ?=0 THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(tagName, targetCommitId, target.branch, body.name?.trim() ?? current.name, body.body ?? current.body, draft ? 1 : 0, prerelease ? 1 : 0, latest ? 1 : 0, draft ? 1 : 0, releaseId),
    auditStatement(env, {
      organizationId: repository.organizationId,
      repositoryId: repository.id,
      actor: principal,
      action: publishing ? 'release.published' : 'release.updated',
      subjectType: 'release',
      subjectId: releaseId,
      details: { tag: tagName }
    })
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'release_tag_exists', 'A release already uses this tag.');
    throw error;
  }
  return json({
    release: { id: releaseId, tagName, draft, prerelease, latest }
  });
}

export async function deleteRelease(env: Env, principal: Principal, owner: string, name: string, releaseId: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.push');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const release = await env.DB.prepare('SELECT id,tag_name AS tagName FROM releases WHERE repository_id=? AND id=?').bind(repository.id, releaseId).first<{ id: string; tagName: string }>();
  if (!release) return problem(404, 'release_not_found', 'Release not found.');
  const cleanup = await deleteReleaseStorage(env, releaseId);
  if (!cleanup.ok) return cleanup;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM releases WHERE id=?').bind(releaseId),
    auditStatement(env, {
      organizationId: repository.organizationId,
      repositoryId: repository.id,
      actor: principal,
      action: 'release.deleted',
      subjectType: 'release',
      subjectId: releaseId,
      details: { tag: release.tagName }
    })
  ]);
  return new Response(null, { status: 204 });
}

export async function downloadReleaseArchive(env: Env, principal: Principal, owner: string, name: string, releaseId: string, format: 'zip' | 'tar.gz'): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const release = await env.DB.prepare('SELECT tag_name AS tagName,target_commit_id AS targetCommitId,draft FROM releases WHERE repository_id=? AND id=?').bind(repository.id, releaseId).first<{ tagName: string; targetCommitId: string; draft: number }>();
  if (!release) return problem(404, 'release_not_found', 'Release not found.');
  if (release.draft && !(await authorizeRepository(env, principal, owner, name, 'repository.push'))) return problem(404, 'release_not_found', 'Release not found.');
  const response = await requestGitGateway(env, '/_marl/archive', { owner, repository: name, commitId: release.targetCommitId, format }, { attempts: 2, timeoutMs: 120_000 }).catch(() => null);
  if (!response?.ok || !response.body) return problem(502, 'release_archive_unavailable', 'The source archive could not be generated.');
  const filename = `${name}-${release.tagName.replace(/[^a-zA-Z0-9._-]+/g, '-')}.${format}`;
  const headers = new Headers(response.headers);
  headers.set('content-disposition', `attachment; filename="${filename}"`);
  headers.set('cache-control', 'private, no-store');
  return new Response(response.body, { status: response.status, headers });
}

async function ensureTag(env: Env, owner: string, repository: string, tag: string, targetCommitId: string, actorId: string): Promise<Response | null> {
  const response = await requestGitGateway(env, '/_marl/tags/create', { owner, repository, tag, targetCommitId, actorId }, { attempts: 2, timeoutMs: 30_000 }).catch(() => null);
  if (!response) return problem(502, 'release_tag_unavailable', 'The release tag could not be published.');
  if (response.status === 409) return problem(409, 'release_tag_conflict', 'This tag already points to another commit.');
  if (!response.ok) return problem(502, 'release_tag_unavailable', 'The release tag could not be published.');
  await response.body?.cancel();
  return null;
}

async function resolveTarget(env: Env, repositoryId: string, target: string) {
  const branch = await env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?').bind(repositoryId, target).first<{ name: string; commitId: string }>();
  if (branch) return { commitId: branch.commitId, branch: branch.name };
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(target)) return null;
  const commit = await env.DB.prepare('SELECT id FROM commits WHERE repository_id=? AND id=?').bind(repositoryId, target).first<{ id: string }>();
  return commit ? { commitId: commit.id, branch: null } : null;
}

function summarize(row: ReleaseRow): ReleaseSummary {
  return {
    id: row.id,
    repository: { owner: row.owner, name: row.repository },
    tagName: row.tagName,
    targetCommitId: row.targetCommitId,
    targetBranch: row.targetBranch,
    name: row.name,
    body: row.body,
    author: row.author,
    authorDisplayName: row.authorDisplayName,
    authorAvatarUrl: row.authorAvatarUrl,
    draft: Boolean(row.draft),
    prerelease: Boolean(row.prerelease),
    latest: Boolean(row.latest),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    assetCount: Number(row.assetCount)
  };
}
