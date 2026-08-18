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
const [apiPort, gitPort, inspectorPort] = reservePorts(3);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const gitUrl = `http://127.0.0.1:${gitPort}`;
const client = new MarlClient(apiUrl, gitUrl, source);
let api: ManagedService | undefined;
let git: ManagedService | undefined;
const jobIds = new Set<string>();
let cleanupPromise: Promise<void> | undefined;

process.once('SIGINT', () => void cleanup().finally(() => process.exit(130)));
process.once('SIGTERM', () => void cleanup().finally(() => process.exit(143)));

try {
  stage('Prepare isolated control plane');
  await mkdir(persistence, { recursive: true });
  await mkdir(repositories, { recursive: true });
  await run(['bunx', 'wrangler', 'd1', 'migrations', 'apply', 'marl', '--local', '--persist-to', persistence], { cwd: apiRoot, timeoutMs: 120_000 });
  await run(['bunx', 'wrangler', 'd1', 'execute', 'marl', '--local', '--persist-to', persistence, '--file=seed.sql'], { cwd: apiRoot, timeoutMs: 120_000 });
  await run(['cargo', 'build', '-p', 'git', '-p', 'cli'], { cwd: root, env: { CARGO_TARGET_DIR: cargoTarget }, timeoutMs: 180_000 });

  api = startApi();
  await waitForHttp(`${apiUrl}/health`, api);
  git = startGit();
  await waitForHttp(`${gitUrl}/health`, git);

  stage('Push Marl through Smart HTTP');
  const repositoryName = `qualification-${Date.now().toString(36)}`;
  const created = await client.request<{ repository: { id: string } }>('/api/v1/repositories', {
    method: 'POST',
    body: JSON.stringify({ owner: 'lantharos', name: repositoryName, description: 'Isolated Marl qualification repository', visibility: 'private' })
  });
  const tokenResponse = await client.request<{ token: { value: string } }>('/api/v1/tokens', {
    method: 'POST',
    body: JSON.stringify({ name: 'Qualification', scopes: ['repo:read', 'repo:write', 'workflow:dispatch'], repositoryIds: [created.repository.id], expiresDays: 1 })
  });
  const token = tokenResponse.token.value;
  const remote = `${gitUrl}/lantharos/${repositoryName}.git`;
  await run(['git', 'clone', '--quiet', '--no-hardlinks', root, source], { timeoutMs: 120_000 });
  await run(['git', 'config', 'user.name', 'Marl Qualification'], { cwd: source });
  await run(['git', 'config', 'user.email', 'qualification@marl.invalid'], { cwd: source });
  await run(['git', 'switch', '-C', 'main'], { cwd: source });
  await mkdir(join(source, '.marl', 'workflows'), { recursive: true });
  await Bun.write(join(source, '.marl', 'workflows', 'qualification.yml'), workflowFile());
  await run(['git', 'add', '.marl/workflows/qualification.yml'], { cwd: source });
  await run(['git', 'commit', '-m', 'Add qualification workflow'], { cwd: source });
  await run(['git', 'remote', 'set-url', 'origin', remote], { cwd: source });
  await client.git(['push', '--set-upstream', 'origin', 'main'], token);

  const workflows = await client.waitFor(
    () => client.request<{ workflows: Array<{ id: string; status: string }> }>(`/api/v1/repositories/lantharos/${repositoryName}/workflows`),
    (value) => value.workflows.length === 1 && value.workflows[0]?.status === 'valid',
    'Workflow indexing did not converge'
  );
  const workflowId = workflows.workflows[0]!.id;

  stage('Verify push supersession');
  await commitMarker('first queued revision');
  await client.git(['push', 'origin', 'main'], token);
  await commitMarker('latest queued revision');
  await client.git(['push', 'origin', 'main'], token);
  const queuedRuns = await client.request<{ runs: RunSummary[] }>(`/api/v1/repositories/lantharos/${repositoryName}/runs?limit=100`);
  const pushRuns = queuedRuns.runs.filter((item) => item.trigger === 'push' && item.branch === 'main');
  assert(pushRuns.length >= 3, 'Expected a workflow run for every main push.');
  assert(pushRuns.filter((item) => ['queued', 'running'].includes(item.state)).length === 1, 'Only the latest supersedable push may remain active.');
  assert(pushRuns.slice(1).every((item) => item.state === 'canceled' && item.cancellationReason === 'superseded'), 'Older push runs were not marked superseded.');

  stage('Execute the latest run in Docker');
  const enrollment = await client.request<{ enrollment: { token: string } }>('/api/v1/runner-enrollments', {
    method: 'POST',
    body: JSON.stringify({ organization: 'lantharos', expiresMinutes: 15 })
  });
  await run([
    executable('marl'), 'runner', 'register', '--url', apiUrl, '--token', enrollment.enrollment.token,
    '--name', `qualification-${Date.now().toString(36)}`, '--label', 'docker', '--concurrency', '1',
    '--work-dir', runnerWork, '--config', runnerConfig
  ], { cwd: root, timeoutMs: 120_000 });
  await run([executable('marl'), 'runner', 'run', '--once', '--config', runnerConfig], { cwd: root, timeoutMs: 300_000 });
  const completedRuns = await client.request<{ runs: RunSummary[] }>(`/api/v1/repositories/lantharos/${repositoryName}/runs?limit=100`);
  const completed = completedRuns.runs.find((item) => item.trigger === 'push' && item.branch === 'main' && item.state === 'success');
  assert(completed, 'The latest push workflow did not complete successfully.');
  const runDetail = await client.request<{ run: { jobsDetail: Array<{ id: string; state: string; artifacts: Array<{ id: string; name: string }> }> } }>(`/api/v1/repositories/lantharos/${repositoryName}/runs/${completed.number}`);
  const completedJob = runDetail.run.jobsDetail[0];
  assert(completedJob?.state === 'success', 'The Docker job did not succeed.');
  jobIds.add(completedJob.id);
  assert(completedJob.artifacts.some((artifact) => artifact.name === 'qualification/result.txt'), 'The qualification artifact was not published.');
  const artifact = completedJob.artifacts.find((item) => item.name === 'qualification/result.txt')!;
  assert((await client.text(`/api/v1/artifacts/${artifact.id}`)).trim() === 'passed', 'The stored artifact contents are incorrect.');
  const logs = await client.text(`/api/v1/jobs/${completedJob.id}/logs`);
  assert(logs.includes('Verify checkout'), 'Persisted job logs are incomplete.');

  stage('Exercise pull request publication');
  for (const method of ['merge', 'squash', 'rebase'] as const) {
    await client.git(['fetch', 'origin', 'main'], token);
    await run(['git', 'switch', '-C', `qualification/${method}`, 'origin/main'], { cwd: source });
    await Bun.write(join(source, `qualification-${method}.txt`), `${method}\n`);
    await run(['git', 'add', `qualification-${method}.txt`], { cwd: source });
    await run(['git', 'commit', '-m', `Qualify ${method} pull request`], { cwd: source });
    await client.git(['push', '--set-upstream', 'origin', `qualification/${method}`], token);
    const pull = await client.request<{ pullRequest: { number: number } }>(`/api/v1/repositories/lantharos/${repositoryName}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title: `Qualify ${method} publication`, body: `Exercises the ${method} path.`, sourceBranch: `qualification/${method}`, targetBranch: 'main' })
    });
    await client.request(`/api/v1/repositories/lantharos/${repositoryName}/pulls/${pull.pullRequest.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `Ready to exercise **${method}** publication.` })
    });
    const merged = await client.request<{ commitId: string }>(`/api/v1/repositories/lantharos/${repositoryName}/pulls/${pull.pullRequest.number}/merge`, {
      method: 'POST',
      body: JSON.stringify({ method })
    });
    const retried = await client.request<{ commitId: string }>(`/api/v1/repositories/lantharos/${repositoryName}/pulls/${pull.pullRequest.number}/merge`, {
      method: 'POST',
      body: JSON.stringify({ method })
    });
    assert(merged.commitId === retried.commitId, `${method} merge retry produced a different commit.`);
    const detail = await client.request<{ pullRequest: { events: Array<{ kind: string }> } }>(`/api/v1/repositories/lantharos/${repositoryName}/pulls/${pull.pullRequest.number}`);
    assert(detail.pullRequest.events.some((event) => event.kind === 'merged'), `${method} merge was not recorded in the timeline.`);
  }

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
  await client.git(['clone', '--quiet', remote, clone], token, { cwd: temporary });
  await run(['git', 'fsck', '--strict'], { cwd: clone, timeoutMs: 120_000 });
  for (const method of ['merge', 'squash', 'rebase']) {
    assert(await Bun.file(join(clone, `qualification-${method}.txt`)).exists(), `${method} merge contents disappeared after restart.`);
  }

  stage('Run deterministic publication crash boundaries');
  await run(['bun', 'test', 'apps/git-edge/src/reliability-harness.test.ts', 'apps/git-edge/src/reconciliation.test.ts', 'apps/git-edge/src/canonical.test.ts'], { cwd: root, timeoutMs: 120_000 });
  console.log('\nMarl qualification passed. Git history, PR publication, runner execution, supersession, restart recovery, and strict clone integrity are healthy.');
  console.log(`Cloudflare state and repositories were isolated under ${temporary} and have been removed.`);
} catch (error) {
  await Promise.allSettled([api?.stop(), git?.stop()].filter(Boolean) as Promise<void>[]);
  const diagnostics = await Promise.all([
    api?.output.then((value) => ['API', value] as const),
    git?.output.then((value) => ['Git', value] as const)
  ].filter(Boolean) as Array<Promise<readonly [string, string]>>);
  for (const [name, output] of diagnostics) {
    if (output.trim()) console.error(`\n${name} service output:\n${output.trim()}`);
  }
  throw error;
} finally {
  await cleanup();
}

function startApi() {
  return new ManagedService([
    'bunx', 'wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(apiPort), '--inspector-port', String(inspectorPort),
    '--persist-to', persistence, '--var', 'ENVIRONMENT:development', '--var', `GIT_GATEWAY_URL:${gitUrl}`,
    '--var', `GIT_PUBLIC_URL:${gitUrl}`, '--var', 'EMAIL_FROM:noreply@marl.sh'
  ], { cwd: apiRoot });
}

function startGit() {
  return new ManagedService([executable('git-gateway')], {
    cwd: root,
    env: { MARL_GIT_ROOT: repositories, MARL_API_URL: apiUrl, MARL_GIT_LISTEN: `127.0.0.1:${gitPort}`, MARL_GIT_LOCAL: '1', MARL_GIT_GATEWAY_TOKEN: 'marl-local' }
  });
}

async function commitMarker(message: string) {
  const marker = join(source, 'qualification-state.txt');
  const previous = await Bun.file(marker).text().catch(() => '');
  await Bun.write(marker, `${previous}${message}\n`);
  await run(['git', 'add', 'qualification-state.txt'], { cwd: source });
  await run(['git', 'commit', '-m', message], { cwd: source });
}

async function cleanupDockerJobs(ids: Set<string>) {
  for (const id of ids) {
    const suffix = id.replace(/^job_/, '').toLowerCase();
    await run(['docker', 'rm', '--force', `marl-job-${suffix}`], { allowFailure: true, timeoutMs: 15_000 });
    await run(['docker', 'network', 'rm', `marl-job-${suffix}`], { allowFailure: true, timeoutMs: 15_000 });
  }
}

function cleanup() {
  cleanupPromise ??= (async () => {
    stopActiveProcesses();
    await Promise.allSettled([api?.stop(), git?.stop()].filter(Boolean) as Promise<void>[]);
    await cleanupDockerJobs(jobIds);
    await rm(temporary, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
  })();
  return cleanupPromise;
}

function executable(name: string) {
  return join(cargoTarget, 'debug', `${name}${process.platform === 'win32' ? '.exe' : ''}`);
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
        run: test -f README.md && mkdir -p qualification && printf 'passed\\n' > qualification/result.txt
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
  cancellationReason?: string;
}
