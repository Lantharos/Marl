import { join } from 'node:path';
import { assert } from '../client';
import type { Qualification } from '../environment';
import { stage, type QualifiedRepository } from '../helpers';
import { run, waitForHttp } from '../process';
import type { QualifiedRelease } from './releases';

async function verifyAfterRestart(
  qualification: Qualification,
  repository: QualifiedRepository,
  release: QualifiedRelease
) {
  const { client, paths, urls } = qualification;
  stage('Restart services and verify repository integrity');
  await qualification.services.git?.stop();
  await waitForHttp(`${urls.git}/health`, qualification.startGit());
  await qualification.services.api?.stop();
  await waitForHttp(`${urls.api}/health`, qualification.startApi());
  await client.git(['clone', '--quiet', repository.remote, paths.clone], repository.token, { cwd: paths.temporary });
  await run(['git', 'fsck', '--strict'], { cwd: paths.clone, timeoutMs: 120_000 });
  for (const method of ['merge', 'squash', 'rebase'])
    assert(
      await Bun.file(join(paths.clone, `qualification-${method}.txt`)).exists(),
      `${method} merge contents disappeared after restart.`
    );
  const restored = await client.request<{ release: { id: string; assets: Array<{ id: string }> } }>(
    `${repository.path}/releases/by-tag?tag=${encodeURIComponent(release.tag)}`
  );
  assert(
    restored.release.id === release.id && restored.release.assets.some((asset) => asset.id === release.assetId),
    'Release metadata did not survive the service restart.'
  );
  assert(
    (await client.text(`/api/v1/release-assets/${release.assetId}/download`)) === release.assetBody,
    'Release asset did not survive the service restart.'
  );
}

async function runCrashBoundaries(qualification: Qualification) {
  stage('Run deterministic publication crash boundaries');
  await run(
    [
      'bun',
      'test',
      'apps/git-edge/src/reliability-harness.test.ts',
      'apps/git-edge/src/state/reconciliation.test.ts',
      'apps/git-edge/src/state/canonical.test.ts'
    ],
    { cwd: qualification.paths.root, timeoutMs: 120_000 }
  );
}

export async function qualifyIntegrity(
  qualification: Qualification,
  repository: QualifiedRepository,
  release: QualifiedRelease
) {
  await verifyAfterRestart(qualification, repository, release);
  await runCrashBoundaries(qualification);
}
