import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { assert } from '../client';
import type { Qualification } from '../environment';
import { head, stage, workflowFile, type QualifiedRepository } from '../helpers';
import { run, waitForHttp } from '../process';

async function prepareControlPlane(qualification: Qualification) {
  const { paths, urls, client } = qualification;
  stage('Prepare isolated control plane');
  await mkdir(paths.persistence, { recursive: true });
  await mkdir(paths.repositories, { recursive: true });
  await run(['bunx', 'wrangler', 'd1', 'migrations', 'apply', 'marl', '--local', '--persist-to', paths.persistence], {
    cwd: paths.api,
    timeoutMs: 120_000
  });
  await run(['cargo', 'build', '-p', 'git', '-p', 'cli'], {
    cwd: paths.root,
    env: { CARGO_TARGET_DIR: paths.cargoTarget },
    timeoutMs: 180_000
  });
  await waitForHttp(`${urls.api}/health`, qualification.startApi());
  await client.authenticate({
    name: 'Marl Qualification',
    username: qualification.owner,
    email: 'qualification@marl.invalid',
    password: qualification.password
  });
  await run(
    [
      'bunx',
      'wrangler',
      'd1',
      'execute',
      'marl',
      '--local',
      '--persist-to',
      paths.persistence,
      '--command',
      "UPDATE auth_user SET email_verified=1 WHERE email='qualification@marl.invalid'"
    ],
    { cwd: paths.api, timeoutMs: 120_000 }
  );
  await waitForHttp(`${urls.git}/health`, qualification.startGit());
  await run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', paths.sshKey], { timeoutMs: 30_000 });
  await client.request('/api/v1/ssh-keys', {
    method: 'POST',
    body: JSON.stringify({ name: 'Qualification', publicKey: await Bun.file(`${paths.sshKey}.pub`).text() })
  });
}

async function pushOverHttp(qualification: Qualification): Promise<QualifiedRepository> {
  const { paths, urls, client, owner } = qualification;
  const source = paths.source;
  stage('Push Marl through Smart HTTP');
  const name = `qualification-${Date.now().toString(36)}`;
  const created = await client.request<{ repository: { id: string } }>('/api/v1/repositories', {
    method: 'POST',
    body: JSON.stringify({ owner, name, description: 'Isolated Marl qualification repository', visibility: 'private' })
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
  const repository = {
    name,
    token: tokenResponse.token.value,
    remote: `${urls.git}/${owner}/${name}.git`,
    path: `/api/v1/repositories/${owner}/${name}`
  };
  await client.request(`${repository.path}/secrets/QUALIFICATION_SECRET`, {
    method: 'PUT',
    body: JSON.stringify({ value: qualification.secret })
  });
  await run(['git', 'clone', '--quiet', '--no-hardlinks', paths.root, source], { timeoutMs: 120_000 });
  for (const [key, value] of [
    ['user.name', 'Marl Qualification'],
    ['user.email', 'qualification@marl.invalid'],
    ['gpg.format', 'ssh'],
    ['gpg.ssh.program', 'ssh-keygen'],
    ['user.signingkey', paths.sshKey],
    ['commit.gpgsign', 'true']
  ])
    await run(['git', 'config', key, value], { cwd: source });
  await run(['git', 'switch', '-C', 'main'], { cwd: source });
  await mkdir(join(source, '.marl', 'workflows'), { recursive: true });
  await Bun.write(join(source, '.marl', 'workflows', 'qualification.yml'), workflowFile());
  await run(['git', 'add', '.marl/workflows/qualification.yml'], { cwd: source });
  await run(['git', 'commit', '-m', 'Add qualification workflow'], { cwd: source });
  await run(['git', 'remote', 'set-url', 'origin', repository.remote], { cwd: source });
  await client.git(['push', '--set-upstream', 'origin', 'main'], repository.token);
  const signed = await client.request<{ signatureStatus: string }>(`${repository.path}/commits/${await head(source)}`);
  assert(signed.signatureStatus === 'verified', 'A commit signed by the account SSH key was not verified.');
  return repository;
}

async function pushOverSsh(qualification: Qualification, repository: QualifiedRepository) {
  const { paths, urls, client, owner } = qualification;
  stage('Authenticate and push through SSH');
  const sshRemote = `${urls.ssh}/${owner}/${repository.name}.git`;
  await run(['git', 'tag', 'qualification-ssh'], { cwd: paths.source });
  await run(['git', 'push', sshRemote, 'refs/tags/qualification-ssh'], {
    cwd: paths.source,
    timeoutMs: 120_000,
    env: qualification.sshEnvironment()
  });
  const sshRefs = await run(['git', 'ls-remote', sshRemote, 'refs/tags/qualification-ssh'], {
    cwd: paths.source,
    timeoutMs: 120_000,
    env: qualification.sshEnvironment()
  });
  assert(sshRefs.stdout.includes('refs/tags/qualification-ssh'), 'SSH Git did not return the pushed reference.');
  await client.waitFor(
    () => client.request<{ workflows: Array<{ path: string; status: string }> }>(`${repository.path}/workflows`),
    (value) =>
      value.workflows.some(
        (workflow) => workflow.path === '.marl/workflows/qualification.yml' && workflow.status === 'valid'
      ),
    'Workflow indexing did not converge'
  );
}

export async function setUpRepository(qualification: Qualification) {
  await prepareControlPlane(qualification);
  const repository = await pushOverHttp(qualification);
  await pushOverSsh(qualification, repository);
  return repository;
}
