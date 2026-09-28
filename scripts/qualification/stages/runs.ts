import { assert } from '../client';
import type { Qualification } from '../environment';
import { commitMarker, head, readAllLogs, stage, type QualifiedRepository, type RunSummary } from '../helpers';
import { run } from '../process';

async function verifySupersession(qualification: Qualification, repository: QualifiedRepository) {
  const { client, paths } = qualification;
  stage('Verify push supersession');
  await commitMarker(qualification, 'first queued revision');
  await client.git(['push', 'origin', 'main'], repository.token);
  await commitMarker(qualification, 'latest queued revision');
  const latest = await head(paths.source);
  await client.git(['push', 'origin', 'main'], repository.token);
  const queued = await client.request<{ runs: RunSummary[] }>(`${repository.path}/runs?limit=100`);
  const pushRuns = queued.runs.filter((item) => item.trigger === 'push' && item.branch === 'main');
  assert(pushRuns.length >= 3, 'Expected a workflow run for every main push.');
  assert(
    pushRuns.filter((item) => ['queued', 'running'].includes(item.state)).length === 1,
    'Only the latest supersedable push may remain active.'
  );
  assert(
    pushRuns
      .filter((item) => !['queued', 'running'].includes(item.state))
      .every((item) => item.state === 'canceled' && item.cancellationReason === 'superseded'),
    'Older push runs were not marked superseded.'
  );
  return latest;
}

async function executeInDocker(qualification: Qualification, repository: QualifiedRepository, commit: string) {
  const { client, paths, urls, owner } = qualification;
  stage('Execute the latest run in Docker');
  const enrollment = await client.request<{ enrollment: { token: string } }>('/api/v1/runner-enrollments', {
    method: 'POST',
    body: JSON.stringify({ organization: owner, expiresMinutes: 15 })
  });
  const marl = qualification.executable('marl');
  await run(
    [
      marl,
      'runner',
      'register',
      '--url',
      urls.api,
      '--token',
      enrollment.enrollment.token,
      '--name',
      `qualification-${Date.now().toString(36)}`,
      '--label',
      'docker',
      '--concurrency',
      '1',
      '--work-dir',
      paths.runnerWork,
      '--config',
      paths.runnerConfig
    ],
    { cwd: paths.root, timeoutMs: 120_000 }
  );
  await run([marl, 'runner', 'run', '--once', '--config', paths.runnerConfig], {
    cwd: paths.root,
    timeoutMs: 300_000
  });
  const runs = await client.request<{ runs: RunSummary[] }>(`${repository.path}/runs?limit=100`);
  const completed = runs.runs.find(
    (item) => item.trigger === 'push' && item.branch === 'main' && item.commit === commit
  );
  assert(
    completed,
    `The runner did not report the latest push workflow for ${commit}.\n${JSON.stringify(runs.runs, null, 2)}`
  );
  const detail = await client.request<{
    run: { jobsDetail: Array<{ id: string; state: string; artifacts: Array<{ id: string; name: string }> }> };
  }>(`${repository.path}/runs/${completed.number}`);
  const job = detail.run.jobsDetail[0];
  if (job) qualification.jobIds.add(job.id);
  const logs = job ? await readAllLogs(client, job.id) : '';
  assert(completed.state === 'success', `The latest push workflow finished as ${completed.state}.\n${logs}`);
  assert(job?.state === 'success', 'The Docker job did not succeed.');
  const artifact = job.artifacts.find((item) => item.name === 'qualification/result.txt');
  assert(artifact, 'The qualification artifact was not published.');
  assert(
    (await client.text(`/api/v1/artifacts/${artifact.id}`)).trim() === 'passed',
    'The stored artifact contents are incorrect.'
  );
  assert(logs.includes('Verify checkout'), 'Persisted job logs are incomplete.');
  assert(
    logs.includes('***') && !logs.includes(qualification.secret),
    'A CI secret was not masked from persisted logs.'
  );
}

export async function qualifyRuns(qualification: Qualification, repository: QualifiedRepository) {
  const latest = await verifySupersession(qualification, repository);
  if (!qualification.skipRunner) await executeInDocker(qualification, repository, latest);
}
