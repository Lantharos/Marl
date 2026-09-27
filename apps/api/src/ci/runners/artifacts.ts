import { identifier } from '../../core/domain';
import { json, problem, readJson } from '../../http/http';
import type { Env } from '../../core/platform';
import { artifactUploadBody } from '../../http/request-schemas';
import { reserveArtifactUploadSql, reserveEmptyArtifactSql, runnerQuotas } from './quotas';
import type { Runner } from './runners';
import { ownsLease } from './jobs';

const artifactPartBytes = 16 * 1024 * 1024;

export async function beginArtifactUpload(
  request: Request,
  env: Env,
  runner: Runner,
  jobId: string
): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  const body = await readJson(request, artifactUploadBody);
  if (!body || !validArtifactName(body.name))
    return problem(422, 'invalid_artifact', 'Artifact names must be relative workspace paths.');
  await discardExpiredArtifactUpload(env, jobId, body.name);
  await discardExpiredArtifactUploads(env);
  const existing = await completedArtifact(env, jobId, body.name);
  if (existing) return json({ artifact: existing, completed: true });
  const active = await activeArtifactUpload(env, jobId, body.name);
  if (active) return artifactUploadResponse(active);
  const id = identifier('artifact');
  const key = `artifacts/${jobId}/${id}`;
  const contentType = body.contentType ?? 'application/octet-stream';
  if (body.byteSize === 0) {
    let stored = false;
    let retained = false;
    try {
      await env.OBJECTS.put(key, new Uint8Array(), { httpMetadata: { contentType } });
      stored = true;
      const reservation = await env.DB.prepare(reserveEmptyArtifactSql)
        .bind(id, jobId, body.name, key, 0, contentType, jobId, body.name, jobId, jobId, runnerQuotas.artifactsPerJob)
        .run();
      if (reservation.meta.changes !== 1) {
        const [completed, uploading] = await Promise.all([
          completedArtifact(env, jobId, body.name),
          activeArtifactUpload(env, jobId, body.name)
        ]);
        if (completed) return json({ artifact: completed, completed: true });
        if (uploading) return artifactUploadResponse(uploading);
        return problem(409, 'artifact_name_conflict', 'An artifact with this name is already being created.');
      }
      retained = true;
      return json({ artifact: { id, name: body.name, byteSize: 0, contentType }, completed: true }, { status: 201 });
    } finally {
      if (stored && !retained) await env.OBJECTS.delete(key);
    }
  }
  const multipart = await env.OBJECTS.createMultipartUpload(key, { httpMetadata: { contentType } });
  let reserved = false;
  try {
    const reservation = await env.DB.prepare(reserveArtifactUploadSql)
      .bind(
        id,
        jobId,
        body.name,
        key,
        multipart.uploadId,
        body.byteSize,
        contentType,
        jobId,
        body.name,
        body.byteSize,
        runnerQuotas.artifactBytesPerJob,
        jobId,
        jobId,
        jobId,
        jobId,
        runnerQuotas.artifactsPerJob
      )
      .run();
    if (reservation.meta.changes !== 1) {
      const [completed, uploading] = await Promise.all([
        completedArtifact(env, jobId, body.name),
        activeArtifactUpload(env, jobId, body.name)
      ]);
      if (completed) return json({ artifact: completed, completed: true });
      if (uploading) return artifactUploadResponse(uploading);
      return problem(413, 'job_artifact_limit', 'A job can retain at most 2 GiB of artifacts.');
    }
    reserved = true;
    return artifactUploadResponse(
      {
        id,
        name: body.name,
        objectKey: key,
        multipartUploadId: multipart.uploadId,
        expectedSize: body.byteSize,
        contentType,
        state: 'uploading'
      },
      201
    );
  } finally {
    if (!reserved) await multipart.abort();
  }
}

export async function uploadArtifactPart(
  request: Request,
  env: Env,
  runner: Runner,
  jobId: string,
  uploadId: string,
  partNumber: number
): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job || !request.body) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  const upload = await artifactUpload(env, jobId, uploadId);
  if (!upload || upload.state !== 'uploading')
    return problem(404, 'artifact_upload_not_found', 'Artifact upload not found.');
  const partCount = Math.ceil(upload.expectedSize / artifactPartBytes);
  const expectedSize =
    partNumber === partCount ? upload.expectedSize - artifactPartBytes * (partCount - 1) : artifactPartBytes;
  const size = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > partCount || size !== expectedSize)
    return problem(422, 'invalid_artifact_part', 'Artifact parts must match the negotiated upload layout.');
  const multipart = env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId);
  const part = await multipart.uploadPart(partNumber, request.body);
  await env.DB.prepare(
    'INSERT INTO artifact_upload_parts (upload_id,part_number,etag,byte_size) VALUES (?,?,?,?) ON CONFLICT(upload_id,part_number) DO UPDATE SET etag=excluded.etag,byte_size=excluded.byte_size'
  )
    .bind(uploadId, partNumber, part.etag, size)
    .run();
  return json({ part });
}

export async function completeArtifactUpload(
  request: Request,
  env: Env,
  runner: Runner,
  jobId: string,
  uploadId: string
): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  const upload = await artifactUpload(env, jobId, uploadId);
  if (!upload) {
    const artifact = await env.DB.prepare(
      'SELECT id,name,byte_size AS byteSize,content_type AS contentType FROM artifacts WHERE id=? AND job_id=?'
    )
      .bind(uploadId, jobId)
      .first();
    return artifact
      ? json({ artifact, completed: true })
      : problem(404, 'artifact_upload_not_found', 'Artifact upload not found.');
  }
  if (upload.state === 'completed') {
    const artifact = await env.DB.prepare(
      'SELECT id,name,byte_size AS byteSize,content_type AS contentType FROM artifacts WHERE id=?'
    )
      .bind(uploadId)
      .first();
    return json({ artifact, completed: true });
  }
  const parts = await env.DB.prepare(
    'SELECT part_number AS partNumber,etag,byte_size AS byteSize FROM artifact_upload_parts WHERE upload_id=? ORDER BY part_number'
  )
    .bind(uploadId)
    .all<{ partNumber: number; etag: string; byteSize: number }>();
  const expectedCount = Math.ceil(upload.expectedSize / artifactPartBytes);
  if (
    parts.results.length !== expectedCount ||
    parts.results.some((part, index) => part.partNumber !== index + 1) ||
    parts.results.reduce((total, part) => total + part.byteSize, 0) !== upload.expectedSize
  )
    return problem(409, 'artifact_upload_incomplete', 'Upload every artifact part before completing it.');
  const multipart = env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId);
  try {
    await multipart.complete(parts.results.map(({ partNumber, etag }) => ({ partNumber, etag })));
  } catch (error) {
    const recovered = await env.OBJECTS.head(upload.objectKey);
    if (!recovered || recovered.size !== upload.expectedSize) throw error;
  }
  const object = await env.OBJECTS.head(upload.objectKey);
  if (!object || object.size !== upload.expectedSize)
    return problem(502, 'artifact_storage_mismatch', 'The completed artifact does not match its declared size.');
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO artifacts (id,job_id,name,object_key,byte_size,content_type) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING'
    ).bind(uploadId, jobId, upload.name, upload.objectKey, upload.expectedSize, upload.contentType),
    env.DB.prepare("UPDATE artifact_uploads SET state='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(
      uploadId
    )
  ]);
  return json(
    {
      artifact: { id: uploadId, name: upload.name, byteSize: upload.expectedSize, contentType: upload.contentType },
      completed: true
    },
    { status: 201 }
  );
}

type Artifact = { id: string; name: string; byteSize: number; contentType: string };

type ArtifactUpload = {
  id: string;
  name: string;
  objectKey: string;
  multipartUploadId: string;
  expectedSize: number;
  contentType: string;
  state: 'uploading' | 'completed';
};

function artifactUpload(env: Env, jobId: string, uploadId: string) {
  return env.DB.prepare(
    `SELECT id,name,object_key AS objectKey,multipart_upload_id AS multipartUploadId,expected_size AS expectedSize,content_type AS contentType,state FROM artifact_uploads WHERE id=? AND job_id=? AND (state='completed' OR expires_at>CURRENT_TIMESTAMP)`
  )
    .bind(uploadId, jobId)
    .first<ArtifactUpload>();
}

function completedArtifact(env: Env, jobId: string, name: string) {
  return env.DB.prepare(
    'SELECT id,name,byte_size AS byteSize,content_type AS contentType FROM artifacts WHERE job_id=? AND name=?'
  )
    .bind(jobId, name)
    .first<Artifact>();
}

function activeArtifactUpload(env: Env, jobId: string, name: string) {
  return env.DB.prepare(
    "SELECT id,name,object_key AS objectKey,multipart_upload_id AS multipartUploadId,expected_size AS expectedSize,content_type AS contentType,state FROM artifact_uploads WHERE job_id=? AND name=? AND state='uploading' AND expires_at>CURRENT_TIMESTAMP"
  )
    .bind(jobId, name)
    .first<ArtifactUpload>();
}

function artifactUploadResponse(upload: ArtifactUpload, status = 200) {
  return json(
    {
      upload: {
        id: upload.id,
        partBytes: artifactPartBytes,
        partCount: Math.ceil(upload.expectedSize / artifactPartBytes)
      },
      completed: false
    },
    { status }
  );
}

function validArtifactName(name: string) {
  return (
    !name.startsWith('/') &&
    !name.startsWith('\\') &&
    !name.includes('\0') &&
    !name.split(/[\\/]/).some((part) => part === '..' || part === '')
  );
}

async function discardExpiredArtifactUploads(env: Env) {
  const expired = await env.DB.prepare(
    "SELECT id,object_key AS objectKey,multipart_upload_id AS multipartUploadId FROM artifact_uploads WHERE state='uploading' AND expires_at<=CURRENT_TIMESTAMP LIMIT 4"
  ).all<{ id: string; objectKey: string; multipartUploadId: string }>();
  for (const upload of expired.results) {
    try {
      await env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId).abort();
      await env.DB.prepare('DELETE FROM artifact_uploads WHERE id=?').bind(upload.id).run();
    } catch (error) {
      console.error('expired artifact upload cleanup deferred', error);
    }
  }
}

async function discardExpiredArtifactUpload(env: Env, jobId: string, name: string) {
  const upload = await env.DB.prepare(
    "SELECT id,object_key AS objectKey,multipart_upload_id AS multipartUploadId FROM artifact_uploads WHERE job_id=? AND name=? AND state='uploading' AND expires_at<=CURRENT_TIMESTAMP"
  )
    .bind(jobId, name)
    .first<{ id: string; objectKey: string; multipartUploadId: string }>();
  if (!upload) return;
  await env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId).abort();
  await env.DB.prepare(
    "DELETE FROM artifact_uploads WHERE id=? AND state='uploading' AND expires_at<=CURRENT_TIMESTAMP"
  )
    .bind(upload.id)
    .run();
}

export function byteStream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}
