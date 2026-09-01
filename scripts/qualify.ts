import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assert, MarlClient } from './qualification/client';
import { ManagedService, reservePorts, run, stopActiveProcesses, waitForHttp } from './qualification/process';

const root = import.meta.dir.replace(/[\\/]scripts$/, '');
const apiRoot = join(root, 'apps', 'api');
const temporary = await mkdtemp(join(tmpdir(), 'marl-qualification-'));
const persistence = join(temporary, 'cloudflare');
const repositories = join(temporary, 'repositories');
const source = join(temporary, 'source');
const clone = join(temporary, 'clone');
const runnerConfig = join(temporary, 'runner.json');
const runnerWork = join(temporary, 'runner-work');
const cargoTarget = join(root, 'target', 'qualification');
const [apiPort, gitPort, sshPort, inspectorPort] = reservePorts(4);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const gitUrl = `http://127.0.0.1:${gitPort}`;
const sshUrl = `ssh://git@127.0.0.1:${sshPort}`;
const sshKey = join(temporary, 'qualification_ed25519');
const qualificationSecret = `marl-qualification-secret-${Date.now().toString(36)}`;
const qualificationOwner = 'qualification';
const qualificationPassword = `Marl-qualification-${crypto.randomUUID()}!`;
const gatewayToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
const skipRunner = process.env.MARL_QUALIFY_SKIP_RUNNER === '1';
const client = new MarlClient(apiUrl, gitUrl, source);
let api: ManagedService | undefined;
let git: ManagedService | undefined;
const jobIds = new Set<string>();
let qualifiedRelease: { id: string; tag: string; assetId: string; assetBody: string } | undefined;
let cleanupPromise: Promise<void> | undefined;

process.once('SIGINT', () => void cleanup().finally(() => process.exit(130)));
process.once('SIGTERM', () => void cleanup().finally(() => process.exit(143)));

try {
  stage('Prepare isolated control plane');
  await mkdir(persistence, { recursive: true });
  await mkdir(repositories, { recursive: true });
  await run(['bunx', 'wrangler', 'd1', 'migrations', 'apply', 'marl', '--local', '--persist-to', persistence], { cwd: apiRoot, timeoutMs: 120_000 });
  await run(['cargo', 'build', '-p', 'git', '-p', 'cli'], {
    cwd: root,
    env: { CARGO_TARGET_DIR: cargoTarget },
    timeoutMs: 180_000
  });

  api = startApi();
  await waitForHttp(`${apiUrl}/health`, api);
  await client.authenticate({
    name: 'Marl Qualification',
    username: qualificationOwner,
    email: 'qualification@marl.invalid',
    password: qualificationPassword
  });
  await run(['bunx', 'wrangler', 'd1', 'execute', 'marl', '--local', '--persist-to', persistence, '--command', "UPDATE auth_user SET email_verified=1 WHERE email='qualification@marl.invalid'"], { cwd: apiRoot, timeoutMs: 120_000 });
  git = startGit();
  await waitForHttp(`${gitUrl}/health`, git);
  await run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', sshKey], {
    timeoutMs: 30_000
  });
  await client.request('/api/v1/ssh-keys', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Qualification',
      publicKey: await Bun.file(`${sshKey}.pub`).text()
    })
  });

  stage('Push Marl through Smart HTTP');
  const repositoryName = `qualification-${Date.now().toString(36)}`;
  const created = await client.request<{ repository: { id: string } }>('/api/v1/repositories', {
    method: 'POST',
    body: JSON.stringify({
      owner: qualificationOwner,
      name: repositoryName,
      description: 'Isolated Marl qualification repository',
      visibility: 'private'
    })
  });
  const tokenResponse = await client.request<{ token: { value: string } }>('/api/v1/tokens', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Qualification',
      scopes: ['repo:read', 'repo:write', 'workflow:dispatch'],
      repositoryIds: [created.repository.id],
      expiresDays: 1
    })
  });
  const token = tokenResponse.token.value;
  const remote = `${gitUrl}/${qualificationOwner}/${repositoryName}.git`;
  const sshRemote = `${sshUrl}/${qualificationOwner}/${repositoryName}.git`;
  await client.request(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/secrets/QUALIFICATION_SECRET`, {
    method: 'PUT',
    body: JSON.stringify({ value: qualificationSecret })
  });
  await run(['git', 'clone', '--quiet', '--no-hardlinks', root, source], {
    timeoutMs: 120_000
  });
  await run(['git', 'config', 'user.name', 'Marl Qualification'], {
    cwd: source
  });
  await run(['git', 'config', 'user.email', 'qualification@marl.invalid'], {
    cwd: source
  });
  await run(['git', 'config', 'gpg.format', 'ssh'], { cwd: source });
  await run(['git', 'config', 'gpg.ssh.program', 'ssh-keygen'], {
    cwd: source
  });
  await run(['git', 'config', 'user.signingkey', sshKey], { cwd: source });
  await run(['git', 'config', 'commit.gpgsign', 'true'], { cwd: source });
  await run(['git', 'switch', '-C', 'main'], { cwd: source });
  await mkdir(join(source, '.marl', 'workflows'), { recursive: true });
  await Bun.write(join(source, '.marl', 'workflows', 'qualification.yml'), workflowFile());
  await run(['git', 'add', '.marl/workflows/qualification.yml'], {
    cwd: source
  });
  await run(['git', 'commit', '-m', 'Add qualification workflow'], {
    cwd: source
  });
  await run(['git', 'remote', 'set-url', 'origin', remote], { cwd: source });
  await client.git(['push', '--set-upstream', 'origin', 'main'], token);
  const signedCommit = (await run(['git', 'rev-parse', 'HEAD'], { cwd: source })).stdout.trim();
  const signedCommitDetail = await client.request<{ signatureStatus: string }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/commits/${signedCommit}`);
  assert(signedCommitDetail.signatureStatus === 'verified', 'A commit signed by the account SSH key was not verified.');

  stage('Authenticate and push through SSH');
  await run(['git', 'tag', 'qualification-ssh'], { cwd: source });
  await run(['git', 'push', sshRemote, 'refs/tags/qualification-ssh'], {
    cwd: source,
    timeoutMs: 120_000,
    env: sshEnvironment()
  });
  const sshRefs = await run(['git', 'ls-remote', sshRemote, 'refs/tags/qualification-ssh'], { cwd: source, timeoutMs: 120_000, env: sshEnvironment() });
  assert(sshRefs.stdout.includes('refs/tags/qualification-ssh'), 'SSH Git did not return the pushed reference.');

  const workflows = await client.waitFor(
    () =>
      client.request<{
        workflows: Array<{ id: string; path: string; status: string }>;
      }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/workflows`),
    (value) => value.workflows.some((workflow) => workflow.path === '.marl/workflows/qualification.yml' && workflow.status === 'valid'),
    'Workflow indexing did not converge'
  );
  const workflowId = workflows.workflows.find((workflow) => workflow.path === '.marl/workflows/qualification.yml')!.id;

  stage('Verify push supersession');
  await commitMarker('first queued revision');
  await client.git(['push', 'origin', 'main'], token);
  await commitMarker('latest queued revision');
  const runnerCommit = (await run(['git', 'rev-parse', 'HEAD'], { cwd: source })).stdout.trim();
  await client.git(['push', 'origin', 'main'], token);
  const queuedRuns = await client.request<{ runs: RunSummary[] }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/runs?limit=100`);
  const pushRuns = queuedRuns.runs.filter((item) => item.trigger === 'push' && item.branch === 'main');
  assert(pushRuns.length >= 3, 'Expected a workflow run for every main push.');
  assert(pushRuns.filter((item) => ['queued', 'running'].includes(item.state)).length === 1, 'Only the latest supersedable push may remain active.');
  assert(
    pushRuns.filter((item) => !['queued', 'running'].includes(item.state)).every((item) => item.state === 'canceled' && item.cancellationReason === 'superseded'),
    'Older push runs were not marked superseded.'
  );

  if (!skipRunner) {
    stage('Execute the latest run in Docker');
    const enrollment = await client.request<{ enrollment: { token: string } }>('/api/v1/runner-enrollments', {
      method: 'POST',
      body: JSON.stringify({
        organization: qualificationOwner,
        expiresMinutes: 15
      })
    });
    await run([executable('marl'), 'runner', 'register', '--url', apiUrl, '--token', enrollment.enrollment.token, '--name', `qualification-${Date.now().toString(36)}`, '--label', 'docker', '--concurrency', '1', '--work-dir', runnerWork, '--config', runnerConfig], { cwd: root, timeoutMs: 120_000 });
    await run([executable('marl'), 'runner', 'run', '--once', '--config', runnerConfig], { cwd: root, timeoutMs: 300_000 });
    const completedRuns = await client.request<{ runs: RunSummary[] }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/runs?limit=100`);
    const completed = completedRuns.runs.find((item) => item.trigger === 'push' && item.branch === 'main' && item.commit === runnerCommit);
    assert(completed, `The runner did not report the latest push workflow for ${runnerCommit}.\n${JSON.stringify(completedRuns.runs, null, 2)}`);
    const runDetail = await client.request<{
      run: {
        jobsDetail: Array<{
          id: string;
          state: string;
          artifacts: Array<{ id: string; name: string }>;
        }>;
      };
    }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/runs/${completed.number}`);
    const completedJob = runDetail.run.jobsDetail[0];
    if (completedJob) jobIds.add(completedJob.id);
    const logs = completedJob ? await readAllLogs(completedJob.id) : '';
    assert(completed.state === 'success', `The latest push workflow finished as ${completed.state}.\n${logs}`);
    assert(completedJob?.state === 'success', 'The Docker job did not succeed.');
    assert(
      completedJob.artifacts.some((artifact) => artifact.name === 'qualification/result.txt'),
      'The qualification artifact was not published.'
    );
    const artifact = completedJob.artifacts.find((item) => item.name === 'qualification/result.txt')!;
    assert((await client.text(`/api/v1/artifacts/${artifact.id}`)).trim() === 'passed', 'The stored artifact contents are incorrect.');
    assert(logs.includes('Verify checkout'), 'Persisted job logs are incomplete.');
    assert(logs.includes('***') && !logs.includes(qualificationSecret), 'A CI secret was not masked from persisted logs.');
  }

  stage('Exercise pull request synchronization and timeline history');
  await client.git(['fetch', 'origin', 'main'], token);
  await run(['git', 'switch', '-C', 'qualification/timeline', 'origin/main'], {
    cwd: source
  });
  await commitMarker('timeline first commit');
  const timelineFirst = (await run(['git', 'rev-parse', 'HEAD'], { cwd: source })).stdout.trim();
  await commitMarker('timeline second commit');
  const timelineSecond = (await run(['git', 'rev-parse', 'HEAD'], { cwd: source })).stdout.trim();
  await client.git(['push', '--set-upstream', 'origin', 'qualification/timeline'], token);
  const timelinePull = await client.request<{
    pullRequest: { number: number };
  }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Qualify pull synchronization',
      body: 'Exercises lifecycle, commit history, and rewritten heads.',
      sourceBranch: 'qualification/timeline',
      targetBranch: 'main',
      draft: true
    })
  });
  const timelinePath = `/api/v1/repositories/${qualificationOwner}/${repositoryName}/pulls/${timelinePull.pullRequest.number}`;
  await client.request(`${timelinePath}/ready`, { method: 'POST' });
  await client.request(`${timelinePath}/close`, { method: 'POST' });
  await client.request(`${timelinePath}/reopen`, { method: 'POST' });
  await client.request(`${timelinePath}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: 'Timeline synchronization review.' })
  });
  await client.request(`${timelinePath}/reviews`, {
    method: 'POST',
    body: JSON.stringify({
      state: 'commented',
      body: 'Current head reviewed.'
    })
  });
  const initialTimeline = await client.request<PullQualificationDetail>(timelinePath);
  assert(initialTimeline.pullRequest.state === 'mergeable', 'Reopened pull request was not mergeable.');
  assert(initialTimeline.pullRequest.events.some((event) => event.kind === 'ready') && initialTimeline.pullRequest.events.some((event) => event.kind === 'closed') && initialTimeline.pullRequest.events.some((event) => event.kind === 'reopened'), 'Pull request lifecycle events are incomplete.');
  assertCommitHistory(initialTimeline, [timelineFirst, timelineSecond]);

  await commitMarker('timeline fast-forward commit');
  const timelineFastForward = (await run(['git', 'rev-parse', 'HEAD'], { cwd: source })).stdout.trim();
  await client.git(['push', 'origin', 'qualification/timeline'], token);
  const fastForwardDetail = await client.waitFor(
    () => client.request<PullQualificationDetail>(timelinePath),
    (value) => value.pullRequest.sourceCommitId === timelineFastForward,
    'Pull request did not synchronize a fast-forward push'
  );
  assert(!fastForwardDetail.pullRequest.events.some((event) => event.kind === 'force_pushed'), 'A fast-forward push was recorded as a force push.');
  assertCommitHistory(fastForwardDetail, [timelineFirst, timelineSecond, timelineFastForward]);

  await run(['git', 'reset', '--hard', 'origin/main'], { cwd: source });
  await commitMarker('timeline rewritten commit');
  const timelineRewritten = (await run(['git', 'rev-parse', 'HEAD'], { cwd: source })).stdout.trim();
  await client.git(['push', '--force-with-lease', 'origin', 'qualification/timeline'], token);
  const rewrittenDetail = await client.waitFor(
    () => client.request<PullQualificationDetail>(timelinePath),
    (value) => value.pullRequest.sourceCommitId === timelineRewritten && value.pullRequest.events.some((event) => event.kind === 'force_pushed'),
    'Pull request did not preserve a force-push timeline event'
  );
  assertCommitHistory(rewrittenDetail, [timelineRewritten]);
  const rewrittenUpdates = await client.request<{
    updates: Array<{ kind: string; payload: { timelineRemoved?: unknown[] } }>;
  }>(`${timelinePath}/updates?after=${fastForwardDetail.pullRequest.realtimeVersion}`);
  assert(
    rewrittenUpdates.updates.some((update) => update.kind === 'pull.synchronized' && Array.isArray(update.payload.timelineRemoved) && update.payload.timelineRemoved.length > 0),
    'Force-push realtime updates did not remove the rewritten commit history.'
  );
  assert(rewrittenDetail.pullRequest.commits.length === 1 && rewrittenDetail.pullRequest.commits[0]?.id === timelineRewritten, 'Current pull request commits did not follow the rewritten head.');
  const rewrittenDiff = await client.request<{ files: unknown[] }>(`${timelinePath}/diff`);
  assert(rewrittenDiff.files.length > 0, 'Pull request diff was empty after a force push.');
  await client.request(`${timelinePath}/merge`, {
    method: 'POST',
    body: JSON.stringify({ method: 'merge' })
  });

  stage('Exercise pull request publication');
  for (const method of ['merge', 'squash', 'rebase'] as const) {
    await client.git(['fetch', 'origin', 'main'], token);
    await run(['git', 'switch', '-C', `qualification/${method}`, 'origin/main'], { cwd: source });
    await Bun.write(join(source, `qualification-${method}.txt`), `${method}\n`);
    await run(['git', 'add', `qualification-${method}.txt`], { cwd: source });
    await run(['git', 'commit', '-m', `Qualify ${method} pull request`], {
      cwd: source
    });
    await client.git(['push', '--set-upstream', 'origin', `qualification/${method}`], token);
    const pull = await client.request<{ pullRequest: { number: number } }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Qualify ${method} publication`,
        body: `Exercises the ${method} path.`,
        sourceBranch: `qualification/${method}`,
        targetBranch: 'main'
      })
    });
    await client.request(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/pulls/${pull.pullRequest.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `Ready to exercise **${method}** publication.`
      })
    });
    const merged = await client.request<{ commitId: string }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/pulls/${pull.pullRequest.number}/merge`, {
      method: 'POST',
      body: JSON.stringify({ method })
    });
    const retried = await client.request<{ commitId: string }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/pulls/${pull.pullRequest.number}/merge`, {
      method: 'POST',
      body: JSON.stringify({ method })
    });
    assert(merged.commitId === retried.commitId, `${method} merge retry produced a different commit.`);
    const detail = await client.request<{
      pullRequest: { events: Array<{ kind: string }> };
    }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/pulls/${pull.pullRequest.number}`);
    assert(
      detail.pullRequest.events.some((event) => event.kind === 'merged'),
      `${method} merge was not recorded in the timeline.`
    );
  }

  stage('Publish a release with assets and source archives');
  const releaseTag = `qualification-v1-${Date.now().toString(36)}`;
  const release = await client.request<{
    release: { id: string; tagName: string; draft: boolean };
  }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tagName: releaseTag,
      target: 'main',
      name: 'Qualification release',
      body: 'Exercises **tags**, source archives, and downloadable assets.',
      makeLatest: true
    })
  });
  assert(!release.release.draft && release.release.tagName === releaseTag, 'Release publication did not return the published tag.');
  const publishedTag = await client.git(['ls-remote', remote, `refs/tags/${releaseTag}`], token);
  assert(publishedTag.stdout.includes(`refs/tags/${releaseTag}`), 'Publishing a release did not create its Git tag.');
  const assetBody = 'marl release qualification\n';
  const assetBytes = new TextEncoder().encode(assetBody);
  const upload = await client.request<{
    upload: { id: string; parts: number; partBytes: number };
  }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/releases/${release.release.id}/asset-uploads`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'qualification.txt',
      byteSize: assetBytes.byteLength,
      contentType: 'text/plain'
    })
  });
  assert(upload.upload.parts === 1, 'Small release asset did not use one multipart part.');
  const uploaded = await client.response(`/api/v1/release-asset-uploads/${upload.upload.id}/parts/1`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(assetBytes.byteLength)
    },
    body: assetBytes
  });
  assert(uploaded.ok, `Release asset part failed (${uploaded.status}): ${await uploaded.text()}`);
  const completedAsset = await client.request<{
    asset: { id: string; name: string };
  }>(`/api/v1/release-asset-uploads/${upload.upload.id}/complete`, {
    method: 'POST'
  });
  assert(completedAsset.asset.name === 'qualification.txt', 'Release asset completion returned the wrong asset.');
  assert((await client.text(`/api/v1/release-assets/${completedAsset.asset.id}/download`)) === assetBody, 'Downloaded release asset did not match the upload.');
  const releaseDetail = await client.request<{
    release: { latest: boolean; assets: Array<{ id: string }> };
  }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/releases/by-tag?tag=${encodeURIComponent(releaseTag)}`);
  assert(releaseDetail.release.latest && releaseDetail.release.assets.some((asset) => asset.id === completedAsset.asset.id), 'Published release detail is incomplete.');
  for (const format of ['zip', 'tar.gz'] as const) {
    const archive = await client.response(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/releases/${release.release.id}/archive/${format}`);
    assert(archive.ok, `Release ${format} archive failed (${archive.status}).`);
    const signature = new Uint8Array(await archive.arrayBuffer()).slice(0, 2);
    assert(format === 'zip' ? signature[0] === 0x50 && signature[1] === 0x4b : signature[0] === 0x1f && signature[1] === 0x8b, `Release ${format} archive has an invalid signature.`);
  }
  qualifiedRelease = {
    id: release.release.id,
    tag: releaseTag,
    assetId: completedAsset.asset.id,
    assetBody
  };

  stage('Reject a stale force-with-lease');
  await client.git(['fetch', 'origin', 'main'], token);
  await run(['git', 'switch', '-C', 'main', 'origin/main'], { cwd: source });
  const stale = (await run(['git', 'rev-parse', 'HEAD'], { cwd: source })).stdout.trim();
  await commitMarker('move main beyond stale lease');
  await client.git(['push', 'origin', 'main'], token);
  await commitMarker('attempt stale lease update');
  const rejected = await client.git(['push', `--force-with-lease=main:${stale}`, 'origin', 'main'], token, { allowFailure: true });
  assert(rejected.exitCode !== 0, 'A stale force-with-lease unexpectedly replaced main.');
  await run(['git', 'reset', '--hard', 'origin/main'], { cwd: source });

  stage('Restart services and verify repository integrity');
  await git.stop();
  git = startGit();
  await waitForHttp(`${gitUrl}/health`, git);
  await api.stop();
  api = startApi();
  await waitForHttp(`${apiUrl}/health`, api);
  await client.git(['clone', '--quiet', remote, clone], token, {
    cwd: temporary
  });
  await run(['git', 'fsck', '--strict'], { cwd: clone, timeoutMs: 120_000 });
  for (const method of ['merge', 'squash', 'rebase']) {
    assert(await Bun.file(join(clone, `qualification-${method}.txt`)).exists(), `${method} merge contents disappeared after restart.`);
  }
  assert(qualifiedRelease, 'Release qualification state was not recorded.');
  const restoredRelease = await client.request<{
    release: { id: string; assets: Array<{ id: string }> };
  }>(`/api/v1/repositories/${qualificationOwner}/${repositoryName}/releases/by-tag?tag=${encodeURIComponent(qualifiedRelease.tag)}`);
  assert(restoredRelease.release.id === qualifiedRelease.id && restoredRelease.release.assets.some((asset) => asset.id === qualifiedRelease.assetId), 'Release metadata did not survive the service restart.');
  assert((await client.text(`/api/v1/release-assets/${qualifiedRelease.assetId}/download`)) === qualifiedRelease.assetBody, 'Release asset did not survive the service restart.');

  stage('Run deterministic publication crash boundaries');
  await run(['bun', 'test', 'apps/git-edge/src/reliability-harness.test.ts', 'apps/git-edge/src/reconciliation.test.ts', 'apps/git-edge/src/canonical.test.ts'], { cwd: root, timeoutMs: 120_000 });
  console.log(`\nMarl qualification passed. Git history, SSH commit signing, PR publication, releases, supersession, restart recovery, and strict clone integrity are healthy.${skipRunner ? ' Runner execution was explicitly skipped.' : ' Runner execution is healthy.'}`);
  console.log(`Cloudflare state and repositories were isolated under ${temporary} and have been removed.`);
} catch (error) {
  await Promise.allSettled([api?.stop(), git?.stop()].filter(Boolean) as Promise<void>[]);
  const diagnostics = await Promise.all([api?.output.then((value) => ['API', value] as const), git?.output.then((value) => ['Git', value] as const)].filter(Boolean) as Array<Promise<readonly [string, string]>>);
  for (const [name, output] of diagnostics) {
    if (output.trim()) console.error(`\n${name} service output:\n${output.trim()}`);
  }
  throw error;
} finally {
  await cleanup();
}

function startApi() {
  return new ManagedService(['bunx', 'wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(apiPort), '--inspector-port', String(inspectorPort), '--persist-to', persistence, '--var', 'ENVIRONMENT:development', '--var', `GIT_GATEWAY_URL:${gitUrl}`, '--var', `GIT_PUBLIC_URL:${gitUrl}`, '--var', `GIT_SSH_PUBLIC_URL:${sshUrl}`, '--var', `GIT_GATEWAY_TOKEN:${gatewayToken}`, '--var', `PUBLIC_URL:${apiUrl}`, '--var', 'SECRET_ENCRYPTION_KEY:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', '--var', 'EMAIL_FROM:noreply@marl.sh'], { cwd: apiRoot });
}

function startGit() {
  return new ManagedService([executable('git-gateway')], {
    cwd: root,
    env: {
      MARL_GIT_ROOT: repositories,
      MARL_API_URL: apiUrl,
      MARL_GIT_LISTEN: `127.0.0.1:${gitPort}`,
      MARL_SSH_LISTEN: `127.0.0.1:${sshPort}`,
      MARL_GIT_LOCAL: '1',
      MARL_GIT_GATEWAY_TOKEN: gatewayToken
    }
  });
}

async function commitMarker(message: string) {
  const marker = join(source, 'qualification-state.txt');
  const previous = await Bun.file(marker)
    .text()
    .catch(() => '');
  await Bun.write(marker, `${previous}${message}\n`);
  await run(['git', 'add', 'qualification-state.txt'], { cwd: source });
  await run(['git', 'commit', '-m', message], { cwd: source });
}

type PullQualificationDetail = {
  pullRequest: {
    state: string;
    sourceCommitId: string;
    realtimeVersion: number;
    commits: Array<{ id: string }>;
    events: Array<{ kind: string; details: Record<string, string> }>;
  };
};

function assertCommitHistory(detail: PullQualificationDetail, expected: string[]) {
  const recorded = new Set(
    detail.pullRequest.events.flatMap((event) => {
      if (event.kind !== 'commits_added') return [];
      try {
        const commits = JSON.parse(event.details.commits ?? '[]') as Array<{
          id?: unknown;
        }>;
        return commits.flatMap((commit) => (typeof commit.id === 'string' ? [commit.id] : []));
      } catch {
        return [];
      }
    })
  );
  assert(recorded.size === expected.length && expected.every((commit) => recorded.has(commit)), 'Pull request timeline does not match the current branch history.');
}

async function cleanupDockerJobs(ids: Set<string>) {
  for (const id of ids) {
    const suffix = id.replace(/^job_/, '').toLowerCase();
    await run(['docker', 'rm', '--force', `marl-job-${suffix}`], {
      allowFailure: true,
      timeoutMs: 15_000
    });
    await run(['docker', 'network', 'rm', `marl-job-${suffix}`], {
      allowFailure: true,
      timeoutMs: 15_000
    });
  }
}

function cleanup() {
  cleanupPromise ??= (async () => {
    stopActiveProcesses();
    await Promise.allSettled([api?.stop(), git?.stop()].filter(Boolean) as Promise<void>[]);
    await cleanupDockerJobs(jobIds);
    await rm(temporary, {
      recursive: true,
      force: true,
      maxRetries: 4,
      retryDelay: 250
    });
  })();
  return cleanupPromise;
}

function executable(name: string) {
  return join(cargoTarget, 'debug', `${name}${process.platform === 'win32' ? '.exe' : ''}`);
}

function sshEnvironment() {
  const knownHosts = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return {
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: `ssh -i "${sshKey}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=${knownHosts}`
  };
}

async function readAllLogs(jobId: string) {
  let cursor = -1;
  let logs = '';
  for (;;) {
    const response = await client.response(`/api/v1/jobs/${jobId}/logs?after=${cursor}`);
    assert(response.ok, `Persisted logs could not be read (${response.status}).`);
    logs += await response.text();
    cursor = Number(response.headers.get('x-marl-log-cursor') ?? cursor);
    if (response.headers.get('x-marl-log-more') !== 'true') return logs;
  }
}

function workflowFile() {
  return `name: Qualification
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  verify:
    labels: [docker]
    runtime:
      image: alpine:3.22
      timeoutMinutes: 10
    steps:
      - name: Verify checkout
        shell: sh
        run: test -f README.md && test -n "$QUALIFICATION_SECRET" && printf '%s\\n' "$QUALIFICATION_SECRET" && mkdir -p qualification && printf 'passed\\n' > qualification/result.txt
    artifacts: [qualification/result.txt]
`;
}

function stage(label: string) {
  console.log(`\n\x1b[38;2;238;117;83m●\x1b[0m ${label}`);
}

interface RunSummary {
  number: number;
  state: string;
  trigger: string;
  branch: string;
  commit: string;
  cancellationReason?: string;
}
