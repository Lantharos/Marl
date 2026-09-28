import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarlClient } from './client';
import { ManagedService, reservePorts, run, stopActiveProcesses } from './process';

export type Qualification = Awaited<ReturnType<typeof createQualification>>;

export async function createQualification() {
  const root = join(import.meta.dir, '..', '..');
  const temporary = await mkdtemp(join(tmpdir(), 'marl-qualification-'));
  const [apiPort, gitPort, sshPort, inspectorPort] = reservePorts(4);
  const paths = {
    root,
    api: join(root, 'apps', 'api'),
    temporary,
    persistence: join(temporary, 'cloudflare'),
    repositories: join(temporary, 'repositories'),
    source: join(temporary, 'source'),
    clone: join(temporary, 'clone'),
    runnerConfig: join(temporary, 'runner.json'),
    runnerWork: join(temporary, 'runner-work'),
    cargoTarget: join(root, 'target', 'qualification'),
    sshKey: join(temporary, 'qualification_ed25519')
  };
  const urls = {
    api: `http://127.0.0.1:${apiPort}`,
    git: `http://127.0.0.1:${gitPort}`,
    ssh: `ssh://git@127.0.0.1:${sshPort}`
  };
  const gatewayToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const services: { api?: ManagedService; git?: ManagedService } = {};
  const jobIds = new Set<string>();
  let cleanupPromise: Promise<void> | undefined;

  const executable = (name: string) =>
    join(paths.cargoTarget, 'debug', `${name}${process.platform === 'win32' ? '.exe' : ''}`);

  function startApi() {
    services.api = new ManagedService(
      [
        'bunx',
        'wrangler',
        'dev',
        '--ip',
        '127.0.0.1',
        '--port',
        String(apiPort),
        '--inspector-port',
        String(inspectorPort),
        '--persist-to',
        paths.persistence,
        '--var',
        'ENVIRONMENT:development',
        '--var',
        `GIT_GATEWAY_URL:${urls.git}`,
        '--var',
        `GIT_PUBLIC_URL:${urls.git}`,
        '--var',
        `GIT_SSH_PUBLIC_URL:${urls.ssh}`,
        '--var',
        `GIT_GATEWAY_TOKEN:${gatewayToken}`,
        '--var',
        `PUBLIC_URL:${urls.api}`,
        '--var',
        'SECRET_ENCRYPTION_KEY:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        '--var',
        'EMAIL_FROM:noreply@marl.sh'
      ],
      { cwd: paths.api }
    );
    return services.api;
  }

  function startGit() {
    services.git = new ManagedService([executable('git-gateway')], {
      cwd: root,
      env: {
        MARL_GIT_ROOT: paths.repositories,
        MARL_API_URL: urls.api,
        MARL_GIT_LISTEN: `127.0.0.1:${gitPort}`,
        MARL_SSH_LISTEN: `127.0.0.1:${sshPort}`,
        MARL_GIT_LOCAL: '1',
        MARL_GIT_GATEWAY_TOKEN: gatewayToken
      }
    });
    return services.git;
  }

  async function stopServices() {
    await Promise.allSettled([services.api?.stop(), services.git?.stop()].filter(Boolean) as Promise<void>[]);
  }

  async function removeDockerJobs() {
    for (const id of jobIds) {
      const suffix = id.replace(/^job_/, '').toLowerCase();
      await run(['docker', 'rm', '--force', `marl-job-${suffix}`], { allowFailure: true, timeoutMs: 15_000 });
      await run(['docker', 'network', 'rm', `marl-job-${suffix}`], { allowFailure: true, timeoutMs: 15_000 });
    }
  }

  function cleanup() {
    cleanupPromise ??= (async () => {
      stopActiveProcesses();
      await stopServices();
      await removeDockerJobs();
      await rm(temporary, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
    })();
    return cleanupPromise;
  }

  async function serviceOutput() {
    return Promise.all(
      [
        services.api?.output.then((value) => ['API', value] as const),
        services.git?.output.then((value) => ['Git', value] as const)
      ].filter(Boolean) as Array<Promise<readonly [string, string]>>
    );
  }

  function sshEnvironment() {
    const knownHosts = process.platform === 'win32' ? 'NUL' : '/dev/null';
    return {
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_COMMAND: `ssh -i "${paths.sshKey}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=${knownHosts}`
    };
  }

  return {
    paths,
    urls,
    owner: 'qualification',
    password: `Marl-qualification-${crypto.randomUUID()}!`,
    secret: `marl-qualification-secret-${Date.now().toString(36)}`,
    skipRunner: process.env.MARL_QUALIFY_SKIP_RUNNER === '1',
    client: new MarlClient(urls.api, urls.git, paths.source),
    services,
    jobIds,
    executable,
    startApi,
    startGit,
    stopServices,
    serviceOutput,
    cleanup,
    sshEnvironment
  };
}
