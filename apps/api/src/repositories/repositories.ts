import type { RepositorySummary } from '@marl/contracts';
import { auditStatement } from '../core/audit';
import type { Principal } from '../auth/principal';
import { identifier, validIdentitySlug, validSlug, validVisibility } from '../core/domain';
import { pageResult, pageSize, readCursor } from '../http/cursor';
import { json, problem, readJson } from '../http/http';
import { readListQuery } from '../http/list-query';
import type { Env } from '../core/platform';
import { createRepositoryBody } from '../http/request-schemas';
import {
  authorizeRepository,
  authorizeRepositoryId,
  lookupRepository,
  repositoryListFilter,
  repositoryPermissions,
  repositoryReadFilter
} from './access/access';
import { readImageAsset, readImageUpload, storedImageKey } from '../core/image-assets';

type RepositoryRow = RepositorySummary & {
  organizationId: string;
  defaultBranch: string;
  archivedAt: string | null;
  deletionScheduledAt: string | null;
};

const selectRepository = `SELECT repositories.id, organizations.slug AS owner, repositories.name, repositories.description, repositories.icon_url AS iconUrl, repositories.visibility, repositories.default_branch AS defaultBranch, repositories.updated_at AS updatedAt, repositories.organization_id AS organizationId, repositories.archived_at AS archivedAt, repositories.deletion_scheduled_at AS deletionScheduledAt FROM repositories JOIN organizations ON organizations.id = repositories.organization_id`;

export async function listRepositories(env: Env, principal: Principal, url: URL): Promise<Response> {
  const search = readListQuery(url);
  if ('error' in search) return search.error;
  const limit = pageSize(url);
  const cursor = readCursor(url);
  const access = repositoryListFilter(principal);
  const visibility = url.searchParams.get('visibility') ?? 'all';
  if (!['all', 'public', 'private', 'archived'].includes(visibility))
    return problem(422, 'invalid_visibility', 'Repository visibility is invalid.');
  const visibilitySql =
    visibility === 'archived'
      ? 'AND repositories.archived_at IS NOT NULL'
      : `${visibility === 'all' ? '' : 'AND repositories.visibility=?'} AND repositories.archived_at IS NULL`;
  const querySql = search.query
    ? `AND (repositories.name LIKE ? ESCAPE '\\' OR organizations.slug LIKE ? ESCAPE '\\' OR repositories.description LIKE ? ESCAPE '\\')`
    : '';
  const after = cursor ? 'AND (repositories.updated_at<? OR (repositories.updated_at=? AND repositories.id<?))' : '';
  const filters = [
    ...access.values,
    ...(['public', 'private'].includes(visibility) ? [visibility] : []),
    ...(search.query ? [search.like, search.like, search.like] : [])
  ];
  const values = cursor ? [...filters, cursor.value, cursor.value, cursor.id, limit + 1] : [...filters, limit + 1];
  const result = await env.DB.prepare(
    `${selectRepository} WHERE ${access.sql} AND repositories.deletion_scheduled_at IS NULL ${visibilitySql} ${querySql} ${after} ORDER BY repositories.updated_at DESC,repositories.id DESC LIMIT ?`
  )
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
  const result = await env.DB.prepare(
    `${selectRepository} WHERE ${access.sql} AND repositories.deletion_scheduled_at IS NULL AND repositories.archived_at IS NULL ORDER BY repositories.updated_at DESC,repositories.id DESC LIMIT 100`
  )
    .bind(...access.values)
    .all<RepositoryRow>();
  return result.results.map(({ organizationId: _, defaultBranch: __, ...repository }) => repository);
}

export type NewRepository = {
  owner: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  defaultLabels: boolean;
};

export async function insertRepository(env: Env, principal: Principal, repository: NewRepository) {
  const { owner, name, description, visibility } = repository;
  if (!validIdentitySlug(owner) || !validSlug(name))
    return problem(422, 'invalid_repository_name', 'Owner and repository names must be URL-safe slugs.');
  if (description.length > 280 || !validVisibility(visibility))
    return problem(422, 'invalid_repository', 'Description or visibility is invalid.');
  const organization = await env.DB.prepare(
    `SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id = organizations.id WHERE organizations.slug = ? COLLATE NOCASE AND organization_members.user_id = ? AND organization_members.role IN ('owner','admin')`
  )
    .bind(owner, principal.id)
    .first<{ id: string }>();
  if (!organization) return problem(403, 'owner_required', 'You cannot create repositories for this owner.');
  const id = identifier('repo');
  const defaults = repository.defaultLabels
    ? [
        ['bug', '#e16f73', 'Something is not working'],
        ['enhancement', '#8c7ad8', 'New or improved functionality'],
        ['documentation', '#68a7b8', 'Documentation changes'],
        ['needs review', '#d3a45f', 'Ready for reviewer attention']
      ]
    : [];
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO repositories (id, organization_id, name, description, visibility, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, organization.id, name, description, visibility, principal.id),
      ...defaults.map(([label, color, detail]) =>
        env.DB.prepare(
          'INSERT INTO repository_labels (id,repository_id,name,color,description) VALUES (?,?,?,?,?)'
        ).bind(identifier('label'), id, label, color, detail)
      ),
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
    if (String(error).toLowerCase().includes('unique'))
      return problem(409, 'repository_exists', 'A repository with this name already exists.');
    throw error;
  }
  return { id, organizationId: organization.id };
}

export async function createRepository(request: Request, env: Env, principal: Principal): Promise<Response> {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Repositories must be created from a browser session.');
  const body = await readJson(request, createRepositoryBody);
  if (!body) return problem(400, 'invalid_json', 'Expected a JSON request body.');
  const { owner, name, description = '', visibility = 'private' } = body;
  if (typeof description !== 'string' || !validVisibility(visibility))
    return problem(422, 'invalid_repository', 'Description or visibility is invalid.');
  const created = await insertRepository(env, principal, { owner, name, description, visibility, defaultLabels: true });
  if (created instanceof Response) return created;
  return json(
    {
      repository: {
        id: created.id,
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

export async function uploadRepositoryIcon(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
): Promise<Response> {
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
    await env.DB.prepare('UPDATE repositories SET icon_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(iconUrl, repository.id)
      .run();
  } catch (error) {
    await env.OBJECTS.delete(key);
    throw error;
  }
  const previousKey = repository.iconUrl && storedImageKey(repository.iconUrl, 'repository-icons', repository.id);
  if (previousKey) await env.OBJECTS.delete(previousKey);
  return json({ iconUrl });
}

export async function readRepositoryIcon(env: Env, repositoryId: string, file: string): Promise<Response> {
  if (!/^repo_[a-z0-9]+$/.test(repositoryId) || !/^[a-f0-9]{32}\.(?:png|jpg|webp)$/.test(file))
    return problem(404, 'repository_icon_not_found', 'Repository icon not found.');
  return readImageAsset(env, `repository-icons/${repositoryId}/${file}`);
}

async function repositoryUnavailable(env: Env, principal: Principal | null, owner: string, name: string) {
  const repository = await lookupRepository(env, owner, name, principal);
  if (repository?.disabledAt && (repository.visibility === 'public' || repository.role))
    return problem(451, 'repository_disabled', repository.disabledReason || 'This repository has been disabled.');
  return problem(404, 'repository_not_found', 'Repository not found.');
}

export async function getRepository(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string
): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return repositoryUnavailable(env, principal, owner, name);
  const sshBase =
    env.GIT_SSH_PUBLIC_URL ?? (env.ENVIRONMENT === 'development' ? 'ssh://git@127.0.0.1:42621' : undefined);
  const forkAccess = repositoryReadFilter(principal, 'forks');
  const [social, upstream] = await Promise.all([
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM repository_stars WHERE repository_id=repositories.id) AS starCount,(SELECT COUNT(*) FROM repositories AS forks WHERE forks.forked_from_repository_id=repositories.id AND ${forkAccess.sql} AND forks.deletion_scheduled_at IS NULL) AS forkCount,EXISTS(SELECT 1 FROM repository_stars WHERE repository_id=repositories.id AND user_id=?) AS starred FROM repositories WHERE repositories.id=?`
    )
      .bind(...forkAccess.values, principal?.id ?? '', repo.id)
      .first<{
        starCount: number;
        forkCount: number;
        starred: number;
      }>(),
    repo.forkedFromRepositoryId
      ? authorizeRepositoryId(env, principal, repo.forkedFromRepositoryId, 'repository.read')
      : null
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

export async function setRepositoryStar(
  env: Env,
  principal: Principal,
  owner: string,
  name: string,
  starred: boolean
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  if (starred)
    await env.DB.prepare('INSERT OR IGNORE INTO repository_stars (repository_id,user_id) VALUES (?,?)')
      .bind(repository.id, principal.id)
      .run();
  else
    await env.DB.prepare('DELETE FROM repository_stars WHERE repository_id=? AND user_id=?')
      .bind(repository.id, principal.id)
      .run();
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM repository_stars WHERE repository_id=?')
    .bind(repository.id)
    .first<{ count: number }>();
  return json({ starred, starCount: Number(count?.count ?? 0) });
}
