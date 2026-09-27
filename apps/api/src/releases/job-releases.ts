import { auditStatement } from '../core/audit';
import { identifier, validTagName } from '../core/domain';
import { problem } from '../http/http';
import type { Env } from '../core/platform';
import type { RunRelease } from '../ci/runs/jobs';
import { ensureTag } from './releases';

export async function publishJobRelease(env: Env, jobId: string): Promise<Response | null> {
  const job = await env.DB.prepare(
    `SELECT jobs.release_json AS releaseJson,runs.repository_id AS repositoryId,runs.commit_id AS commitId,runs.branch,runs.actor_id AS actorId,repositories.created_by AS createdBy,repositories.organization_id AS organizationId,repositories.name,organizations.slug AS owner FROM jobs JOIN runs ON runs.id=jobs.run_id JOIN repositories ON repositories.id=runs.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE jobs.id=?`
  )
    .bind(jobId)
    .first<{
      releaseJson: string | null;
      repositoryId: string;
      commitId: string;
      branch: string;
      actorId: string | null;
      createdBy: string;
      organizationId: string;
      name: string;
      owner: string;
    }>();
  if (!job?.releaseJson) return null;
  const release = JSON.parse(job.releaseJson) as RunRelease;
  if (!validTagName(release.tag))
    return problem(409, 'runner_release_tag_invalid', 'The resolved release tag is not a valid Git tag.');
  const authorId = job.actorId ?? job.createdBy;
  const artifacts = await env.DB.prepare(
    'SELECT id,name,object_key AS objectKey,byte_size AS byteSize,content_type AS contentType FROM artifacts WHERE job_id=? ORDER BY created_at'
  )
    .bind(jobId)
    .all<{ id: string; name: string; objectKey: string; byteSize: number; contentType: string }>();
  const selected = artifacts.results.filter((artifact) =>
    release.files.some((pattern) => matchesArtifact(pattern, artifact.name))
  );
  if (release.files.length && !selected.length)
    return problem(409, 'runner_release_assets_missing', 'The release files did not match any uploaded job artifacts.');
  let stored = await env.DB.prepare(
    'SELECT releases.id,releases.target_commit_id AS targetCommitId,releases.draft,releases.source_job_id AS sourceJobId,source_jobs.state AS sourceJobState FROM releases LEFT JOIN jobs AS source_jobs ON source_jobs.id=releases.source_job_id WHERE releases.repository_id=? AND releases.tag_name=?'
  )
    .bind(job.repositoryId, release.tag)
    .first<{
      id: string;
      targetCommitId: string;
      draft: number;
      sourceJobId: string | null;
      sourceJobState: string | null;
    }>();
  if (
    stored &&
    stored.sourceJobId !== jobId &&
    stored.targetCommitId === job.commitId &&
    stored.draft &&
    ['failure', 'canceled'].includes(stored.sourceJobState ?? '')
  ) {
    await env.DB.prepare(
      'UPDATE releases SET source_job_id=?,author_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND source_job_id=?'
    )
      .bind(jobId, authorId, stored.id, stored.sourceJobId)
      .run();
    stored = { ...stored, sourceJobId: jobId, sourceJobState: 'running' };
  }
  if (stored && (stored.targetCommitId !== job.commitId || stored.sourceJobId !== jobId))
    return problem(409, 'runner_release_conflict', 'The workflow release conflicts with an existing release.');
  if (!stored) {
    const id = identifier('release');
    try {
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO releases (id,repository_id,tag_name,target_commit_id,target_branch,name,body,author_id,source_job_id,draft,prerelease,latest,published_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,0,NULL)'
        ).bind(
          id,
          job.repositoryId,
          release.tag,
          job.commitId,
          job.branch,
          release.name,
          release.body,
          authorId,
          jobId,
          release.prerelease ? 1 : 0
        ),
        auditStatement(env, {
          organizationId: job.organizationId,
          repositoryId: job.repositoryId,
          action: 'release.drafted',
          subjectType: 'release',
          subjectId: id,
          details: { tag: release.tag, target: job.commitId, jobId }
        })
      ]);
    } catch (error) {
      if (!String(error).toLowerCase().includes('unique')) throw error;
    }
    stored = await env.DB.prepare(
      'SELECT id,target_commit_id AS targetCommitId,draft,source_job_id AS sourceJobId,NULL AS sourceJobState FROM releases WHERE repository_id=? AND tag_name=?'
    )
      .bind(job.repositoryId, release.tag)
      .first<{
        id: string;
        targetCommitId: string;
        draft: number;
        sourceJobId: string | null;
        sourceJobState: string | null;
      }>();
  }
  if (!stored) return problem(502, 'runner_release_failed', 'The workflow release could not be stored.');
  const existingCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM release_assets WHERE release_id=?')
    .bind(stored.id)
    .first<{ count: number }>();
  const existingNames = await env.DB.prepare('SELECT name FROM release_assets WHERE release_id=?')
    .bind(stored.id)
    .all<{ name: string }>();
  const names = new Set(existingNames.results.map((asset) => asset.name));
  if (Number(existingCount?.count ?? 0) + selected.filter((artifact) => !names.has(artifact.name)).length > 100)
    return problem(409, 'release_asset_limit', 'A release can contain up to 100 assets.');
  for (const artifact of selected) {
    if (names.has(artifact.name)) continue;
    const source = await env.OBJECTS.get(artifact.objectKey);
    if (!source) return problem(502, 'runner_release_asset_missing', `Artifact ${artifact.name} is unavailable.`);
    const assetId = identifier('releaseasset');
    const objectKey = `release-assets/${job.repositoryId}/${stored.id}/${assetId}`;
    await env.OBJECTS.put(objectKey, source.body, { httpMetadata: { contentType: artifact.contentType } });
    try {
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO release_assets (id,release_id,uploader_id,name,object_key,byte_size,content_type) VALUES (?,?,?,?,?,?,?)'
        ).bind(assetId, stored.id, authorId, artifact.name, objectKey, artifact.byteSize, artifact.contentType),
        auditStatement(env, {
          organizationId: job.organizationId,
          repositoryId: job.repositoryId,
          action: 'release.asset_uploaded',
          subjectType: 'release_asset',
          subjectId: assetId,
          details: { releaseId: stored.id, name: artifact.name, byteSize: artifact.byteSize, jobId }
        })
      ]);
    } catch (error) {
      await env.OBJECTS.delete(objectKey);
      if (!String(error).toLowerCase().includes('unique')) throw error;
    }
  }
  if (!release.draft && stored.draft) {
    const tagError = await ensureTag(env, job.owner, job.name, release.tag, job.commitId, authorId);
    if (tagError) return tagError;
    const statements = [];
    if (release.makeLatest)
      statements.push(
        env.DB.prepare(
          'UPDATE releases SET latest=0,updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND latest=1 AND id!=?'
        ).bind(job.repositoryId, stored.id)
      );
    statements.push(
      env.DB.prepare(
        'UPDATE releases SET draft=0,prerelease=?,latest=?,published_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND source_job_id=?'
      ).bind(release.prerelease ? 1 : 0, release.makeLatest ? 1 : 0, stored.id, jobId),
      auditStatement(env, {
        organizationId: job.organizationId,
        repositoryId: job.repositoryId,
        action: 'release.published',
        subjectType: 'release',
        subjectId: stored.id,
        details: { tag: release.tag, target: job.commitId, jobId }
      })
    );
    await env.DB.batch(statements);
  }
  return null;
}

function matchesArtifact(pattern: string, name: string) {
  const normalized = pattern.replaceAll('\\', '/').replace(/\/$/, '');
  if (!/[?*]/.test(normalized)) return name === normalized || name.startsWith(`${normalized}/`);
  let expression = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
    } else if (character === '*') expression += '[^/]*';
    else if (character === '?') expression += '[^/]';
    else expression += escapeRegularExpression(character);
  }
  return new RegExp(`^${expression}$`).test(name);
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
