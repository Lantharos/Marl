import { assert } from '../client';
import type { Qualification } from '../environment';
import { commitMarker, head, stage, type QualifiedRepository } from '../helpers';
import { run } from '../process';

export type QualifiedRelease = { id: string; tag: string; assetId: string; assetBody: string };

async function uploadAsset(qualification: Qualification, repository: QualifiedRepository, releaseId: string) {
  const { client } = qualification;
  const assetBody = 'marl release qualification\n';
  const bytes = new TextEncoder().encode(assetBody);
  const upload = await client.request<{ upload: { id: string; parts: number } }>(
    `${repository.path}/releases/${releaseId}/asset-uploads`,
    {
      method: 'POST',
      body: JSON.stringify({ name: 'qualification.txt', byteSize: bytes.byteLength, contentType: 'text/plain' })
    }
  );
  assert(upload.upload.parts === 1, 'Small release asset did not use one multipart part.');
  const uploaded = await client.response(`/api/v1/release-asset-uploads/${upload.upload.id}/parts/1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.byteLength) },
    body: bytes
  });
  assert(uploaded.ok, `Release asset part failed (${uploaded.status}): ${await uploaded.text()}`);
  const completed = await client.request<{ asset: { id: string; name: string } }>(
    `/api/v1/release-asset-uploads/${upload.upload.id}/complete`,
    { method: 'POST' }
  );
  assert(completed.asset.name === 'qualification.txt', 'Release asset completion returned the wrong asset.');
  assert(
    (await client.text(`/api/v1/release-assets/${completed.asset.id}/download`)) === assetBody,
    'Downloaded release asset did not match the upload.'
  );
  return { assetId: completed.asset.id, assetBody };
}

async function publishRelease(qualification: Qualification, repository: QualifiedRepository) {
  const { client } = qualification;
  stage('Publish a release with assets and source archives');
  const tag = `qualification-v1-${Date.now().toString(36)}`;
  const { release } = await client.request<{ release: { id: string; tagName: string; draft: boolean } }>(
    `${repository.path}/releases`,
    {
      method: 'POST',
      body: JSON.stringify({
        tagName: tag,
        target: 'main',
        name: 'Qualification release',
        body: 'Exercises **tags**, source archives, and downloadable assets.',
        makeLatest: true
      })
    }
  );
  assert(!release.draft && release.tagName === tag, 'Release publication did not return the published tag.');
  const published = await client.git(['ls-remote', repository.remote, `refs/tags/${tag}`], repository.token);
  assert(published.stdout.includes(`refs/tags/${tag}`), 'Publishing a release did not create its Git tag.');
  const asset = await uploadAsset(qualification, repository, release.id);
  const detail = await client.request<{ release: { latest: boolean; assets: Array<{ id: string }> } }>(
    `${repository.path}/releases/by-tag?tag=${encodeURIComponent(tag)}`
  );
  assert(
    detail.release.latest && detail.release.assets.some((item) => item.id === asset.assetId),
    'Published release detail is incomplete.'
  );
  for (const format of ['zip', 'tar.gz'] as const) {
    const archive = await client.response(`${repository.path}/releases/${release.id}/archive/${format}`);
    assert(archive.ok, `Release ${format} archive failed (${archive.status}).`);
    const signature = new Uint8Array(await archive.arrayBuffer()).slice(0, 2);
    assert(
      format === 'zip'
        ? signature[0] === 0x50 && signature[1] === 0x4b
        : signature[0] === 0x1f && signature[1] === 0x8b,
      `Release ${format} archive has an invalid signature.`
    );
  }
  return { id: release.id, tag, ...asset };
}

async function rejectStaleLease(qualification: Qualification, repository: QualifiedRepository) {
  const { client, paths } = qualification;
  stage('Reject a stale force-with-lease');
  await client.git(['fetch', 'origin', 'main'], repository.token);
  await run(['git', 'switch', '-C', 'main', 'origin/main'], { cwd: paths.source });
  const stale = await head(paths.source);
  await commitMarker(qualification, 'move main beyond stale lease');
  await client.git(['push', 'origin', 'main'], repository.token);
  await commitMarker(qualification, 'attempt stale lease update');
  const rejected = await client.git(['push', `--force-with-lease=main:${stale}`, 'origin', 'main'], repository.token, {
    allowFailure: true
  });
  assert(rejected.exitCode !== 0, 'A stale force-with-lease unexpectedly replaced main.');
  await run(['git', 'reset', '--hard', 'origin/main'], { cwd: paths.source });
}

export async function qualifyReleases(qualification: Qualification, repository: QualifiedRepository) {
  const release = await publishRelease(qualification, repository);
  await rejectStaleLease(qualification, repository);
  return release;
}
