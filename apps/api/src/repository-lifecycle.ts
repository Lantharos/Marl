import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { requireFreshSession, type Principal } from './auth';
import { database } from './db';
import { organizations, repositories } from './db/schema';
import { requestGitGateway } from './git-gateway';
import { json, problem } from './http';
import type { Env } from './platform';
import { deleteRepositoryMetadata } from './repository-metadata-cleanup';
import { lookupRepository, repositoryListFilter } from './repository-access';

export async function listDeletedRepositories(env: Env, principal: Principal) {
  const access = repositoryListFilter(principal, 'repositories', { includeDeleted: true, adminOnly: true });
  const rows = await env.DB.prepare(`SELECT repositories.name,organizations.slug AS owner,repositories.deletion_scheduled_at AS deletionScheduledAt,repositories.deletion_started_at AS deletionStartedAt FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.deletion_scheduled_at IS NOT NULL AND ${access.sql} ORDER BY repositories.deletion_scheduled_at DESC LIMIT 100`).bind(...access.values).all<{ owner: string; name: string; deletionScheduledAt: string; deletionStartedAt: string | null }>();
  return json({ repositories: rows.results });
}

export async function restoreRepository(request: Request, env: Env, principal: Principal, owner: string, name: string) {
  const repository = await lookupRepository(env, owner, name, principal);
  if (!repository || repository.role !== 'admin' || principal.authType !== 'session') return problem(404, 'repository_not_found', 'Repository not found.');
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'identity_confirmation_required', 'Confirm your identity before restoring this repository.');
  const restored = await database(env).update(repositories).set({ deletionScheduledAt: null, updatedAt: sql`CURRENT_TIMESTAMP` }).where(and(eq(repositories.id, repository.id), isNull(repositories.deletionStartedAt), sql`${repositories.deletionScheduledAt} > ${new Date().toISOString()}`)).returning({ id: repositories.id });
  if (!restored.length) return problem(409, 'recovery_expired', 'This repository is no longer available for recovery.');
  return new Response(null, { status: 204 });
}

async function deletePrefix(env: Env, prefix: string) {
  const objects = await env.OBJECTS.list({ prefix, limit: 500 });
  if (objects.objects.length) await env.OBJECTS.delete(objects.objects.map(object => object.key));
  return !objects.truncated;
}

async function deleteJobStorage(env: Env, repositoryId: string) {
  const jobs = await env.DB.prepare('SELECT jobs.id FROM jobs JOIN runs ON runs.id=jobs.run_id WHERE runs.repository_id=? LIMIT 5').bind(repositoryId).all<{ id: string }>();
  for (const job of jobs.results) {
    const uploads = await env.DB.prepare("SELECT id,object_key AS objectKey,multipart_upload_id AS uploadId FROM artifact_uploads WHERE job_id=? AND state='uploading' LIMIT 20").bind(job.id).all<{ id: string; objectKey: string; uploadId: string }>();
    for (const upload of uploads.results) {
      await env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.uploadId).abort();
      await env.DB.prepare('DELETE FROM artifact_uploads WHERE id=?').bind(upload.id).run();
    }
    if (uploads.results.length) return false;
    if (!await deletePrefix(env, `logs/${job.id}/`) || !await deletePrefix(env, `artifacts/${job.id}/`)) return false;
    await env.DB.prepare('DELETE FROM jobs WHERE id=?').bind(job.id).run();
  }
  return jobs.results.length < 5;
}

async function deleteReleaseUploads(env: Env, repositoryId: string) {
  const uploads = await env.DB.prepare('SELECT release_asset_uploads.id,object_key AS objectKey,multipart_upload_id AS uploadId FROM release_asset_uploads JOIN releases ON releases.id=release_asset_uploads.release_id WHERE releases.repository_id=? LIMIT 50').bind(repositoryId).all<{ id: string; objectKey: string; uploadId: string }>();
  for (const upload of uploads.results) {
    await env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.uploadId).abort();
    await env.DB.prepare('DELETE FROM release_asset_uploads WHERE id=?').bind(upload.id).run();
  }
  return uploads.results.length < 50;
}

export async function purgeDeletedRepositories(env: Env) {
  const db = database(env);
  const expired = await db.select({ id: repositories.id, organizationId: repositories.organizationId, owner: organizations.slug, name: repositories.name }).from(repositories).innerJoin(organizations, eq(organizations.id, repositories.organizationId)).where(and(isNotNull(repositories.deletionScheduledAt), lte(repositories.deletionScheduledAt, new Date().toISOString()))).orderBy(repositories.updatedAt).limit(10);
  for (const repository of expired) {
    try {
      const claimed = await db.update(repositories).set({ deletionStartedAt: sql`COALESCE(${repositories.deletionStartedAt}, ${new Date().toISOString()})`, updatedAt: new Date().toISOString() }).where(and(eq(repositories.id, repository.id), lte(repositories.deletionScheduledAt, new Date().toISOString()))).returning({ id: repositories.id });
      if (!claimed.length) continue;
      const gateway = await requestGitGateway(env, '/_marl/repositories/purge', { repositoryId: repository.id, organizationId: repository.organizationId, owner: repository.owner, repository: repository.name });
      if (gateway.status === 202) continue;
      if (gateway.status !== 204) throw new Error(`Git purge returned ${gateway.status}`);
      if (!await deleteJobStorage(env, repository.id) || !await deleteReleaseUploads(env, repository.id)) continue;
      let complete = true;
      for (const prefix of [`repositories/${repository.id}/`, `repository-icons/${repository.id}/`, `release-assets/${repository.id}/`]) complete = await deletePrefix(env, prefix) && complete;
      if (complete && await deleteRepositoryMetadata(env, repository.id)) await db.delete(repositories).where(and(eq(repositories.id, repository.id), isNotNull(repositories.deletionStartedAt)));
    } catch (error) {
      console.error('Repository purge failed', { repositoryId: repository.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
