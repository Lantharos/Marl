import type { Principal } from '../../auth/principal';
import { safeRepositoryPath } from '../../core/domain';
import type { Env } from '../../core/platform';
import { requestGitObject } from '../../git/gateway';
import { rawBlobHeaders } from '../../git/raw-content';
import { problem } from '../../http/http';
import { authorizeRepository, type RepositoryAccess } from '../access/access';
import { readGatewayTree } from './source';

export type BlobLocation = { commitId: string; objectId: string };

export async function readBlob(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  revision: string,
  path: string,
  execution: ExecutionContext
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  if (!safeRepositoryPath(path)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  const location = await locateBlob(env, repository, revision, path);
  if (location instanceof Response) return location;
  const immutableRevision = revision.toLowerCase() === location.commitId.toLowerCase();
  return blobResponse(env, execution, repository, path, location.objectId, immutableRevision);
}

export async function locateBlob(
  env: Env,
  repository: RepositoryAccess,
  revision: string,
  path: string
): Promise<BlobLocation | Response> {
  const resolved = await env.DB.prepare(
    `SELECT commits.id AS commitId,repository_entries.object_id AS objectId FROM commits LEFT JOIN repository_entries ON repository_entries.repository_id=commits.repository_id AND repository_entries.tree_id=commits.tree_id AND repository_entries.path=? AND repository_entries.kind='blob' WHERE commits.repository_id=? AND commits.id=COALESCE((SELECT commit_id FROM branches WHERE repository_id=? AND name=?),?)`
  )
    .bind(path, repository.id, repository.id, revision, revision)
    .first<{ commitId: string; objectId: string | null }>();
  if (!resolved) return problem(404, 'revision_not_found', 'Revision not found.');
  if (resolved.objectId) return { commitId: resolved.commitId, objectId: resolved.objectId };
  const parentPath = path.split('/').slice(0, -1).join('/');
  const historical = await readGatewayTree(env, repository.owner, repository.name, resolved.commitId, parentPath);
  if (!historical) return problem(502, 'tree_gateway_failed', 'Git gateway could not resolve this historical file.');
  const entry = historical.find((candidate) => candidate.path === path && candidate.kind === 'blob');
  if (!entry) return problem(404, 'blob_not_found', 'File not found at this revision.');
  return { commitId: resolved.commitId, objectId: entry.objectId };
}

export async function blobResponse(
  env: Env,
  execution: ExecutionContext,
  repository: RepositoryAccess,
  path: string,
  objectId: string,
  immutableRevision: boolean
): Promise<Response> {
  const cacheKey = new Request(
    `https://blob-cache.marl.internal/v4/${repository.id}/${objectId}/${encodeURIComponent(path)}`
  );
  const cached = await caches.default.match(cacheKey);
  if (cached)
    return new Response(cached.body, {
      headers: rawBlobHeaders(path, repository.visibility, cached.headers.get('content-length'), immutableRevision)
    });
  const response = await requestGitObject(env, repository, objectId, 3).catch(() => null);
  if (!response?.ok || !response.body || response.headers.get('x-marl-git-object-type') !== 'blob')
    return problem(502, 'blob_gateway_failed', 'Git storage could not read this file.');
  const length = response.headers.get('content-length');
  const [body, copy] = response.body.tee();
  const stored = new Response(copy, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } });
  if (length) stored.headers.set('content-length', length);
  execution.waitUntil(caches.default.put(cacheKey, stored));
  return new Response(body, { headers: rawBlobHeaders(path, repository.visibility, length, immutableRevision) });
}
