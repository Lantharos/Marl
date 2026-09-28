import { commitSignatureStatusSql } from '../../git/commit-signing';
import type { Principal } from '../../auth/principal';
import { safeRepositoryPath } from '../../core/domain';
import { pageResult, pageSize, readCursor } from '../../http/cursor';
import { requestGitGateway } from '../../git/gateway';
import { json, problem, readJsonValue } from '../../http/http';
import type { D1Result, Env } from '../../core/platform';
import { authorizeRepository, authorizeRepositoryId, repositoryCan } from '../access/access';
import { commitAuthorIdSql } from '../../git/commit-authors';
import { rawBlobHeaders } from '../../git/raw-content';

export async function listBranches(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string
): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const result = await env.DB.prepare(
    `SELECT branches.name, branches.commit_id AS commitId, commits.title, branches.updated_at AS updatedAt, NOT EXISTS (SELECT 1 FROM branch_rules WHERE branch_rules.repository_id=branches.repository_id AND branch_rules.pattern IN (branches.name, '*')) AS unprotected FROM branches JOIN commits ON commits.repository_id = branches.repository_id AND commits.id = branches.commit_id WHERE branches.repository_id = ? AND branches.name NOT LIKE 'marl-queue/%' ORDER BY branches.name`
  )
    .bind(repo.id)
    .all();
  return json({
    defaultBranch: repo.defaultBranch,
    branches: result.results.map((branch) => ({
      ...branch,
      canDelete:
        repositoryCan(repo, principal, 'repository.push') &&
        Boolean(branch.unprotected) &&
        branch.name !== repo.defaultBranch
    }))
  });
}

export async function listPullSources(env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const target = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!target) return problem(404, 'repository_not_found', 'Repository not found.');
  const rootId = target.forkRootRepositoryId ?? target.id;
  const targetBranches = await env.DB.prepare(
    'SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? ORDER BY name'
  )
    .bind(target.id)
    .all<{ name: string; commitId: string }>();
  const candidates = await env.DB.prepare(
    `SELECT repositories.id,organizations.slug AS owner,repositories.name,repositories.default_branch AS defaultBranch FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE COALESCE(repositories.fork_root_repository_id,repositories.id)=? AND repositories.deletion_scheduled_at IS NULL ORDER BY CASE WHEN repositories.id=? THEN 0 ELSE 1 END,organizations.slug,repositories.name`
  )
    .bind(rootId, target.id)
    .all<{ id: string; owner: string; name: string; defaultBranch: string }>();
  const sources = [];
  for (const candidate of candidates.results) {
    const capability = candidate.id === target.id ? 'repository.triage' : 'repository.push';
    if (!(await authorizeRepositoryId(env, principal, candidate.id, capability))) continue;
    const branches = await env.DB.prepare(
      'SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? ORDER BY name'
    )
      .bind(candidate.id)
      .all<{ name: string; commitId: string }>();
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

export async function listCommits(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  url: URL
): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const limit = pageSize(url, 50, 100);
  const cursor = readCursor(url);
  const revision = url.searchParams.get('revision') ?? repo.defaultBranch;
  const resolved = await resolveRevision(env, repo.id, revision);
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  const after = cursor ? 'WHERE (authoredAt<? OR (authoredAt=? AND id<?))' : '';
  const values = cursor
    ? [resolved.id, repo.id, repo.id, cursor.value, cursor.value, cursor.id, limit + 1]
    : [resolved.id, repo.id, repo.id, limit + 1];
  const result = await env.DB.prepare(
    `WITH RECURSIVE history(id) AS (SELECT ? UNION SELECT json_each.value FROM history JOIN commits ON commits.repository_id=? AND commits.id=history.id JOIN json_each(commits.parent_ids)), commit_rows AS (SELECT commits.*,${commitAuthorIdSql()} AS matched_author_id FROM commits), ordered AS (SELECT commit_rows.id,substr(commit_rows.id,1,7) AS shortId,commit_rows.title,commit_rows.author_name AS author,commit_authors.handle AS authorHandle,commit_authors.display_name AS authorDisplayName,commit_authors.avatar_url AS authorAvatarUrl,commit_rows.authored_at AS authoredAt,${commitSignatureStatusSql('commit_rows')} AS signatureStatus,COUNT(*) OVER () AS total FROM commit_rows JOIN history ON history.id=commit_rows.id LEFT JOIN users AS commit_authors ON commit_authors.id=commit_rows.matched_author_id WHERE commit_rows.repository_id=?) SELECT * FROM ordered ${after} ORDER BY authoredAt DESC,id DESC LIMIT ?`
  )
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

export async function getCommit(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  commitId: string
): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!/^[0-9a-f]{7,64}$/i.test(commitId)) return problem(422, 'invalid_commit', 'Commit identifier is invalid.');
  commitId = commitId.toLowerCase();
  if (commitId.length !== 40 && commitId.length !== 64) {
    const matches = await env.DB.prepare(
      'SELECT id FROM commits WHERE repository_id=? AND id>=? AND id<? ORDER BY id LIMIT 2'
    )
      .bind(repo.id, commitId, `${commitId}g`)
      .all<{ id: string }>();
    if (matches.results.length !== 1)
      return problem(
        matches.results.length ? 422 : 404,
        matches.results.length ? 'ambiguous_commit' : 'commit_not_found',
        matches.results.length ? 'Use a longer commit identifier.' : 'Commit not found.'
      );
    commitId = matches.results[0].id;
  }
  const indexed = await env.DB.prepare(
    `WITH commit_row AS (SELECT commits.*,${commitAuthorIdSql()} AS matched_author_id FROM commits WHERE commits.repository_id=? AND commits.id=?) SELECT commit_row.id,${commitSignatureStatusSql('commit_row')} AS signatureStatus,commit_authors.handle AS authorHandle,commit_authors.display_name AS authorDisplayName,commit_authors.avatar_url AS authorAvatarUrl FROM commit_row LEFT JOIN users AS commit_authors ON commit_authors.id=commit_row.matched_author_id`
  )
    .bind(repo.id, commitId)
    .first<{
      id: string;
      signatureStatus: string;
      authorHandle: string | null;
      authorDisplayName: string | null;
      authorAvatarUrl: string | null;
    }>();
  if (!indexed) return problem(404, 'commit_not_found', 'Commit not found.');
  const response = await requestGitGateway(
    env,
    '/_marl/commit',
    { owner, repository: name, commitId },
    { attempts: 2 }
  );
  if (!response.ok) return problem(502, 'commit_gateway_failed', 'Git gateway could not read this commit.');
  const commit = await readJsonValue<{ author?: string; authorEmail?: string }>(response, 16 * 1024 * 1024);
  if (!commit || typeof commit.author !== 'string')
    return problem(502, 'commit_gateway_failed', 'Git gateway returned invalid commit data.');
  return json({
    ...commit,
    signatureStatus: indexed.signatureStatus,
    authorHandle: indexed.authorHandle,
    authorDisplayName: indexed.authorDisplayName,
    authorAvatarUrl: indexed.authorAvatarUrl
  });
}

export async function readCommitPatch(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  commitId: string,
  url: URL
): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const path = url.searchParams.get('path') ?? '';
  if (!safeRepositoryPath(path)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  const resolved = await resolveRevision(env, repo.id, commitId);
  if (!resolved) return problem(404, 'commit_not_found', 'Commit not found.');
  const commit = await env.DB.prepare('SELECT parent_ids AS parentIds FROM commits WHERE repository_id=? AND id=?')
    .bind(repo.id, resolved.id)
    .first<{ parentIds: string }>();
  let parents: unknown = [];
  try {
    parents = JSON.parse(commit?.parentIds ?? '[]');
  } catch {
    return problem(500, 'commit_metadata_invalid', 'Stored commit metadata is invalid.');
  }
  const base =
    Array.isArray(parents) && typeof parents[0] === 'string' ? parents[0] : '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const response = await requestGitGateway(
    env,
    '/_marl/patch',
    { owner, repository: name, base, head: resolved.id, path },
    { attempts: 2 }
  ).catch(() => null);
  if (!response?.ok) return problem(502, 'patch_gateway_failed', 'Git gateway could not read this file diff.');
  return new Response(response.body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export async function listTree(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  url: URL
): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const revision = url.searchParams.get('revision') ?? repo.defaultBranch;
  const parentPath = url.searchParams.get('path') ?? '';
  const query = url.searchParams.get('query')?.trim() ?? '';
  if (parentPath && !safeRepositoryPath(parentPath)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  if (query.length > 120) return problem(422, 'invalid_query', 'File search is too long.');
  const resolved = await resolveRevision(env, repo.id, revision);
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  const indexed = query
    ? await env.DB.prepare(
        "SELECT path, name, kind, object_id AS objectId, byte_size AS byteSize FROM repository_entries WHERE repository_id = ? AND tree_id = ? AND instr(lower(path), lower(?)) > 0 ORDER BY CASE kind WHEN 'tree' THEN 0 ELSE 1 END, path COLLATE NOCASE LIMIT 100"
      )
        .bind(repo.id, resolved.treeId, query)
        .all()
    : await env.DB.prepare(
        "SELECT path, name, kind, object_id AS objectId, byte_size AS byteSize FROM repository_entries WHERE repository_id = ? AND tree_id = ? AND parent_path = ? ORDER BY CASE kind WHEN 'tree' THEN 0 ELSE 1 END, name COLLATE NOCASE"
      )
        .bind(repo.id, resolved.treeId, parentPath)
        .all();
  let entries = indexed.results;
  if (!query && entries.length === 0) {
    const historical = await readGatewayTree(env, owner, name, resolved.id, parentPath);
    if (!historical) return problem(502, 'tree_gateway_failed', 'Git gateway could not read this repository tree.');
    entries = historical;
  }
  const paths = entries.map((entry) => entry.path).filter((path): path is string => typeof path === 'string');
  const lastChanges = paths.length
    ? await env.DB.prepare(
        `WITH RECURSIVE history(id) AS (SELECT ? UNION SELECT json_each.value FROM history JOIN commits ON commits.repository_id=? AND commits.id=history.id JOIN json_each(commits.parent_ids)), ranked AS (SELECT commit_changes.path,commits.id AS commitId,commits.title AS message,commits.author_name AS author,commits.authored_at AS updatedAt,ROW_NUMBER() OVER (PARTITION BY commit_changes.path ORDER BY commit_changes.position DESC,commits.authored_at DESC,commits.id) AS rank FROM commit_changes JOIN history ON history.id=commit_changes.commit_id JOIN commits ON commits.repository_id=commit_changes.repository_id AND commits.id=commit_changes.commit_id JOIN json_each(?) requested ON requested.value=commit_changes.path WHERE commit_changes.repository_id=?) SELECT path,commitId,message,author,updatedAt FROM ranked WHERE rank=1`
      )
        .bind(resolved.id, repo.id, JSON.stringify(paths), repo.id)
        .all<{
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

export async function readBlob(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  revision: string,
  path: string,
  ctx: ExecutionContext
): Promise<Response> {
  const repo = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!safeRepositoryPath(path)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  const resolved = await resolveRevision(env, repo.id, revision);
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  let entry = await env.DB.prepare(
    `SELECT object_id AS objectId FROM repository_entries WHERE repository_id=? AND tree_id=? AND path=? AND kind='blob'`
  )
    .bind(repo.id, resolved.treeId, path)
    .first<{ objectId: string }>();
  if (!entry?.objectId) {
    const parentPath = path.split('/').slice(0, -1).join('/');
    const historical = await readGatewayTree(env, owner, name, resolved.id, parentPath);
    if (!historical) return problem(502, 'tree_gateway_failed', 'Git gateway could not resolve this historical file.');
    entry = historical.find((candidate) => candidate.path === path && candidate.kind === 'blob') ?? null;
  }
  if (!entry?.objectId) return problem(404, 'blob_not_found', 'File not found at this revision.');
  const immutableRevision = revision.toLowerCase() === resolved.id.toLowerCase();
  const cacheKey = new Request(
    `https://blob-cache.marl.internal/v3/${repo.id}/${entry.objectId}/${encodeURIComponent(path)}`
  );
  const publicCache = (caches as unknown as { default: Cache }).default;
  if (repo.visibility === 'public') {
    const cached = await publicCache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set(
        'cache-control',
        immutableRevision ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'
      );
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
  }
  const response = await (
    env.ENVIRONMENT === 'development'
      ? requestGitGateway(env, '/_marl/blob', { owner, repository: name, objectId: entry.objectId }, { attempts: 3 })
      : requestGitGateway(env, '/_marl/object', { repositoryId: repo.id, objectId: entry.objectId }, { attempts: 3 })
  ).catch(() => null);
  if (!response?.ok || !response.body || response.headers.get('x-marl-git-object-type') !== 'blob')
    return problem(502, 'blob_gateway_failed', 'Git storage could not read this file.');
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

async function readGatewayTree(
  env: Env,
  owner: string,
  repository: string,
  commitId: string,
  path: string
): Promise<TreeEntry[] | null> {
  const response = await requestGitGateway(
    env,
    '/_marl/tree',
    { owner, repository, commitId, path },
    { attempts: 2 }
  ).catch(() => null);
  if (!response?.ok) return null;
  const body = await readJsonValue<{ entries?: TreeEntry[] }>(response, 16 * 1024 * 1024);
  if (!Array.isArray(body?.entries)) return null;
  return body.entries.filter(
    (entry) =>
      entry &&
      typeof entry.path === 'string' &&
      safeRepositoryPath(entry.path) &&
      typeof entry.name === 'string' &&
      ['tree', 'blob'].includes(entry.kind) &&
      typeof entry.objectId === 'string' &&
      /^[0-9a-f]{40,64}$/.test(entry.objectId)
  );
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
  return env.DB.prepare(
    `WITH commit_row AS (SELECT commits.*,${commitAuthorIdSql()} AS matched_author_id FROM commits WHERE commits.repository_id=? AND commits.id=COALESCE((SELECT commit_id FROM branches WHERE repository_id=? AND name=?),?)) SELECT commit_row.id,commit_row.tree_id AS treeId,commit_row.title,commit_row.author_name AS author,commit_authors.handle AS authorHandle,commit_authors.display_name AS authorDisplayName,commit_authors.avatar_url AS authorAvatarUrl,commit_row.authored_at AS authoredAt,${commitSignatureStatusSql('commit_row')} AS signatureStatus FROM commit_row LEFT JOIN users AS commit_authors ON commit_authors.id=commit_row.matched_author_id`
  )
    .bind(repositoryId, repositoryId, revision, revision)
    .first<{
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

export function placeholders(values: readonly unknown[]) {
  return values.map(() => '?').join(',');
}

export async function queryInChunks<T>(
  values: string[],
  size: number,
  query: (chunk: string[]) => Promise<D1Result<T>>
) {
  const rows: T[] = [];
  for (let offset = 0; offset < values.length; offset += size)
    rows.push(...(await query(values.slice(offset, offset + size))).results);
  return rows;
}
