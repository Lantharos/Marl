import type { ReleaseAsset } from '@marl/contracts';
import { auditStatement } from './audit';
import type { Principal } from './auth';
import { identifier } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { authorizeRepository, authorizeRepositoryId } from './repository-access';
import { releaseAssetUploadBody } from './request-schemas';

const partBytes = 8 * 1024 * 1024;
const maximumAssets = 100;
const uploadLifetimeMs = 24 * 60 * 60 * 1000;

type UploadRow = {
  id: string;
  assetId: string;
  releaseId: string;
  repositoryId: string;
  organizationId: string;
  name: string;
  objectKey: string;
  multipartUploadId: string;
  expectedSize: number;
  contentType: string;
  expiresAt: string;
};

export async function listReleaseAssets(env: Env, releaseId: string, canDelete: boolean): Promise<ReleaseAsset[]> {
  const rows = await env.DB.prepare('SELECT id,name,byte_size AS byteSize,content_type AS contentType,download_count AS downloadCount,created_at AS createdAt FROM release_assets WHERE release_id=? ORDER BY created_at,id').bind(releaseId).all<Omit<ReleaseAsset, 'downloadUrl' | 'canDelete'>>();
  return rows.results.map((asset) => ({
    ...asset,
    byteSize: Number(asset.byteSize),
    downloadCount: Number(asset.downloadCount),
    downloadUrl: `/api/v1/release-assets/${asset.id}/download`,
    canDelete
  }));
}

export async function beginReleaseAssetUpload(request: Request, env: Env, principal: Principal, owner: string, name: string, releaseId: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.push');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const release = await env.DB.prepare('SELECT id FROM releases WHERE repository_id=? AND id=?').bind(repository.id, releaseId).first<{ id: string }>();
  if (!release) return problem(404, 'release_not_found', 'Release not found.');
  const body = await readJson(request, releaseAssetUploadBody);
  const assetName = body ? normalizeAssetName(body.name) : null;
  if (!body || !assetName) return problem(422, 'invalid_release_asset', 'Choose a valid asset name and size.');
  await cleanExpiredUploads(env, releaseId);
  const count = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM release_assets WHERE release_id=?) + (SELECT COUNT(*) FROM release_asset_uploads WHERE release_id=?) AS count').bind(releaseId, releaseId).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= maximumAssets) return problem(409, 'release_asset_limit', `A release can contain up to ${maximumAssets} assets.`);
  const conflict = await env.DB.prepare('SELECT 1 AS found FROM release_assets WHERE release_id=? AND name=? UNION ALL SELECT 1 FROM release_asset_uploads WHERE release_id=? AND name=? LIMIT 1').bind(releaseId, assetName, releaseId, assetName).first();
  if (conflict) return problem(409, 'release_asset_exists', 'An asset already uses this name.');
  const uploadId = identifier('releaseupload');
  const assetId = identifier('releaseasset');
  const objectKey = `release-assets/${repository.id}/${releaseId}/${assetId}`;
  const contentType = normalizeContentType(body.contentType);
  const expiresAt = new Date(Date.now() + uploadLifetimeMs).toISOString();
  const multipart = await env.OBJECTS.createMultipartUpload(objectKey, {
    httpMetadata: { contentType }
  });
  try {
    await env.DB.prepare('INSERT INTO release_asset_uploads (id,asset_id,release_id,uploader_id,name,object_key,multipart_upload_id,expected_size,content_type,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(uploadId, assetId, releaseId, principal.id, assetName, objectKey, multipart.uploadId, body.byteSize, contentType, expiresAt).run();
  } catch (error) {
    await multipart.abort().catch(() => undefined);
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'release_asset_exists', 'An asset already uses this name.');
    throw error;
  }
  return json(
    {
      upload: {
        id: uploadId,
        assetId,
        name: assetName,
        byteSize: body.byteSize,
        partBytes,
        parts: Math.ceil(body.byteSize / partBytes),
        expiresAt
      }
    },
    { status: 201 }
  );
}

export async function uploadReleaseAssetPart(request: Request, env: Env, principal: Principal, uploadId: string, partNumber: number): Promise<Response> {
  const upload = await findUpload(env, uploadId);
  if (!upload || !(await authorizeRepositoryId(env, principal, upload.repositoryId, 'repository.push'))) return problem(404, 'release_upload_not_found', 'Release asset upload not found.');
  if (new Date(upload.expiresAt).getTime() <= Date.now()) return problem(410, 'release_upload_expired', 'This asset upload has expired.');
  const parts = Math.ceil(upload.expectedSize / partBytes);
  const expected = partNumber === parts ? upload.expectedSize - partBytes * (parts - 1) : partBytes;
  const declared = request.headers.get('content-length');
  if (!request.body || !Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > parts || declared !== String(expected)) return problem(422, 'invalid_release_asset_part', `Part ${partNumber} must contain exactly ${expected} bytes.`);
  const multipart = env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId);
  const uploaded = await multipart.uploadPart(partNumber, request.body);
  await env.DB.prepare('INSERT INTO release_asset_upload_parts (upload_id,part_number,etag,byte_size) VALUES (?,?,?,?) ON CONFLICT(upload_id,part_number) DO UPDATE SET etag=excluded.etag,byte_size=excluded.byte_size').bind(uploadId, partNumber, uploaded.etag, expected).run();
  return new Response(null, { status: 204, headers: { etag: uploaded.etag } });
}

export async function completeReleaseAssetUpload(env: Env, principal: Principal, uploadId: string): Promise<Response> {
  const upload = await findUpload(env, uploadId);
  if (!upload || !(await authorizeRepositoryId(env, principal, upload.repositoryId, 'repository.push'))) return problem(404, 'release_upload_not_found', 'Release asset upload not found.');
  if (new Date(upload.expiresAt).getTime() <= Date.now()) return problem(410, 'release_upload_expired', 'This asset upload has expired.');
  const expectedParts = Math.ceil(upload.expectedSize / partBytes);
  const parts = await env.DB.prepare('SELECT part_number AS partNumber,etag,byte_size AS byteSize FROM release_asset_upload_parts WHERE upload_id=? ORDER BY part_number').bind(uploadId).all<{ partNumber: number; etag: string; byteSize: number }>();
  const complete = parts.results.length === expectedParts && parts.results.every((part, index) => part.partNumber === index + 1 && Number(part.byteSize) === (part.partNumber === expectedParts ? upload.expectedSize - partBytes * (expectedParts - 1) : partBytes));
  if (!complete) return problem(409, 'release_upload_incomplete', 'Every asset part must finish before publication.');
  const multipart = env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId);
  await multipart.complete(
    parts.results.map((part) => ({
      partNumber: part.partNumber,
      etag: part.etag
    }))
  );
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO release_assets (id,release_id,uploader_id,name,object_key,byte_size,content_type) VALUES (?,?,?,?,?,?,?)').bind(upload.assetId, upload.releaseId, principal.id, upload.name, upload.objectKey, upload.expectedSize, upload.contentType),
      env.DB.prepare('DELETE FROM release_asset_uploads WHERE id=?').bind(uploadId),
      auditStatement(env, {
        organizationId: upload.organizationId,
        repositoryId: upload.repositoryId,
        actor: principal,
        action: 'release.asset_uploaded',
        subjectType: 'release_asset',
        subjectId: upload.assetId,
        details: {
          releaseId: upload.releaseId,
          name: upload.name,
          byteSize: upload.expectedSize
        }
      })
    ]);
  } catch (error) {
    await env.OBJECTS.delete(upload.objectKey).catch(() => undefined);
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'release_asset_exists', 'An asset already uses this name.');
    throw error;
  }
  const asset: ReleaseAsset = {
    id: upload.assetId,
    name: upload.name,
    byteSize: upload.expectedSize,
    contentType: upload.contentType,
    downloadCount: 0,
    createdAt: new Date().toISOString(),
    downloadUrl: `/api/v1/release-assets/${upload.assetId}/download`,
    canDelete: true
  };
  return json({ asset }, { status: 201 });
}

export async function abortReleaseAssetUpload(env: Env, principal: Principal, uploadId: string): Promise<Response> {
  const upload = await findUpload(env, uploadId);
  if (!upload || !(await authorizeRepositoryId(env, principal, upload.repositoryId, 'repository.push'))) return problem(404, 'release_upload_not_found', 'Release asset upload not found.');
  await env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId)
    .abort()
    .catch(() => undefined);
  await env.DB.prepare('DELETE FROM release_asset_uploads WHERE id=?').bind(uploadId).run();
  return new Response(null, { status: 204 });
}

export async function downloadReleaseAsset(env: Env, principal: Principal, assetId: string): Promise<Response> {
  const asset = await env.DB.prepare('SELECT release_assets.id,release_assets.name,release_assets.object_key AS objectKey,release_assets.content_type AS contentType,releases.repository_id AS repositoryId,releases.draft FROM release_assets JOIN releases ON releases.id=release_assets.release_id WHERE release_assets.id=?').bind(assetId).first<{
    id: string;
    name: string;
    objectKey: string;
    contentType: string;
    repositoryId: string;
    draft: number;
  }>();
  if (!asset || !(await authorizeRepositoryId(env, principal, asset.repositoryId, 'repository.read'))) return problem(404, 'release_asset_not_found', 'Release asset not found.');
  if (asset.draft && !(await authorizeRepositoryId(env, principal, asset.repositoryId, 'repository.push'))) return problem(404, 'release_asset_not_found', 'Release asset not found.');
  const object = await env.OBJECTS.get(asset.objectKey);
  if (!object) return problem(502, 'release_asset_missing', 'Release asset bytes are missing.');
  await env.DB.prepare('UPDATE release_assets SET download_count=download_count+1 WHERE id=?').bind(assetId).run();
  return new Response(object.body, {
    headers: {
      'content-type': asset.contentType,
      'content-disposition': contentDisposition(asset.name),
      'content-length': String(object.size),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export async function deleteReleaseAsset(env: Env, principal: Principal, assetId: string): Promise<Response> {
  const asset = await env.DB.prepare('SELECT release_assets.id,release_assets.name,release_assets.object_key AS objectKey,releases.repository_id AS repositoryId,repositories.organization_id AS organizationId FROM release_assets JOIN releases ON releases.id=release_assets.release_id JOIN repositories ON repositories.id=releases.repository_id WHERE release_assets.id=?').bind(assetId).first<{
    id: string;
    name: string;
    objectKey: string;
    repositoryId: string;
    organizationId: string;
  }>();
  if (!asset || !(await authorizeRepositoryId(env, principal, asset.repositoryId, 'repository.push'))) return problem(404, 'release_asset_not_found', 'Release asset not found.');
  await env.OBJECTS.delete(asset.objectKey);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM release_assets WHERE id=?').bind(assetId),
    auditStatement(env, {
      organizationId: asset.organizationId,
      repositoryId: asset.repositoryId,
      actor: principal,
      action: 'release.asset_deleted',
      subjectType: 'release_asset',
      subjectId: assetId,
      details: { name: asset.name }
    })
  ]);
  return new Response(null, { status: 204 });
}

export async function deleteReleaseStorage(env: Env, releaseId: string): Promise<Response> {
  const [assets, uploads] = await Promise.all([env.DB.prepare('SELECT object_key AS objectKey FROM release_assets WHERE release_id=?').bind(releaseId).all<{ objectKey: string }>(), env.DB.prepare('SELECT object_key AS objectKey,multipart_upload_id AS multipartUploadId FROM release_asset_uploads WHERE release_id=?').bind(releaseId).all<{ objectKey: string; multipartUploadId: string }>()]);
  const results = await Promise.allSettled([...uploads.results.map((upload) => env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId).abort()), ...assets.results.map((asset) => env.OBJECTS.delete(asset.objectKey))]);
  if (results.some((result) => result.status === 'rejected')) return problem(502, 'release_asset_cleanup_failed', 'Release assets could not be removed safely.');
  return new Response(null, { status: 204 });
}

async function cleanExpiredUploads(env: Env, releaseId: string) {
  const expired = await env.DB.prepare('SELECT id,object_key AS objectKey,multipart_upload_id AS multipartUploadId FROM release_asset_uploads WHERE release_id=? AND expires_at<=CURRENT_TIMESTAMP LIMIT 10').bind(releaseId).all<{ id: string; objectKey: string; multipartUploadId: string }>();
  for (const upload of expired.results) {
    await env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId)
      .abort()
      .catch(() => undefined);
    await env.DB.prepare('DELETE FROM release_asset_uploads WHERE id=?').bind(upload.id).run();
  }
}

async function findUpload(env: Env, uploadId: string) {
  return env.DB.prepare('SELECT release_asset_uploads.id,release_asset_uploads.asset_id AS assetId,release_asset_uploads.release_id AS releaseId,releases.repository_id AS repositoryId,repositories.organization_id AS organizationId,release_asset_uploads.name,release_asset_uploads.object_key AS objectKey,release_asset_uploads.multipart_upload_id AS multipartUploadId,release_asset_uploads.expected_size AS expectedSize,release_asset_uploads.content_type AS contentType,release_asset_uploads.expires_at AS expiresAt FROM release_asset_uploads JOIN releases ON releases.id=release_asset_uploads.release_id JOIN repositories ON repositories.id=releases.repository_id WHERE release_asset_uploads.id=?').bind(uploadId).first<UploadRow>();
}

function normalizeAssetName(value: string) {
  const name = value.trim();
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

function normalizeContentType(value?: string) {
  const type = value?.trim().toLowerCase() ?? '';
  return type && !/[\r\n]/.test(type) ? type : 'application/octet-stream';
}

function contentDisposition(name: string) {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
