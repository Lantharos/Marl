import { route } from '../http/router';
import { approveRunChecks } from '../pulls/merge/checks';
import { beginArtifactUpload, completeArtifactUpload, uploadArtifactPart } from './runners/artifacts';
import { claimJob, completeJob, renewJob, uploadLog } from './runners/jobs';
import { createEnrollment, getRunner, heartbeatRunner, listRunners, registerRunner } from './runners/runners';
import { connectRunRealtime } from './runs/realtime';
import {
  cancelRun,
  downloadArtifact,
  getRun,
  getRunState,
  listRepositoryRuns,
  listRuns,
  readJobLogs,
  retryRun
} from './runs/runs';
import { organizationSecrets, repositorySecrets } from './workflows/secrets';
import { dispatchWorkflow, getWorkflow, listWorkflows } from './workflows/workflows';

const job = '/runner/jobs/:job(job_[a-z0-9]+)';
const runs = '/repositories/:owner/:repo/runs';
const run = `${runs}/:number(\\d+)`;
const workflow = '/repositories/:owner/:repo/workflows/:workflow(workflow_[a-z0-9]+)';
const secretMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export const ciRoutes = [
  route('POST', '/runner/register', 'public', ({ request, env }) => registerRunner(request, env)),
  route('POST', '/runner/heartbeat', 'runner', ({ env, runner }) => heartbeatRunner(env, runner)),
  route('POST', '/runner/claim', 'runner', ({ env, runner }) => claimJob(env, runner)),
  route('POST', `${job}/renew`, 'runner', ({ request, env, runner }, { job }) => renewJob(request, env, runner, job)),
  route('POST', `${job}/complete`, 'runner', ({ request, env, runner }, { job }) =>
    completeJob(request, env, runner, job)
  ),
  route('PUT', `${job}/logs/:sequence(\\d+)`, 'runner', ({ request, env, runner }, { job, sequence }) =>
    uploadLog(request, env, runner, job, Number(sequence))
  ),
  route('POST', `${job}/artifacts`, 'runner', ({ request, env, runner }, { job }) =>
    beginArtifactUpload(request, env, runner, job)
  ),
  route(
    'PUT',
    `${job}/artifacts/:upload(artifact_[a-z0-9]+)/parts/:part(\\d+)`,
    'runner',
    ({ request, env, runner }, { job, upload, part }) =>
      uploadArtifactPart(request, env, runner, job, upload, Number(part))
  ),
  route('POST', `${job}/artifacts/:upload(artifact_[a-z0-9]+)/complete`, 'runner', ({ request, env, runner }, params) =>
    completeArtifactUpload(request, env, runner, params.job, params.upload)
  ),
  route('GET', '/jobs/:job(job_[a-z0-9]+)/logs', 'optional', ({ env, principal, url }, { job }) =>
    readJobLogs(env, principal, job, url)
  ),
  route('GET', '/jobs/:job(job_[a-z0-9]+)/live', 'optional', ({ request, env, principal }, { job }) =>
    connectRunRealtime(request, env, principal, job)
  ),
  route('GET', '/artifacts/:id(artifact_[a-z0-9]+)', 'optional', ({ env, principal }, { id }) =>
    downloadArtifact(env, principal, id)
  ),
  route('GET', '/runners', 'user', ({ env, principal }) => listRunners(env, principal)),
  route('GET', '/runners/:id(runner_[a-z0-9]+)', 'user', ({ env, principal }, { id }) => getRunner(env, principal, id)),
  route('POST', '/runner-enrollments', 'user', ({ request, env, principal }) =>
    createEnrollment(request, env, principal)
  ),
  route('GET', '/runs', 'user', ({ env, principal, url }) => listRuns(env, principal, url)),
  route('GET', runs, 'optional', ({ env, principal, url }, { owner, repo }) =>
    listRepositoryRuns(env, principal, owner, repo, url)
  ),
  route('GET', run, 'optional', ({ env, principal }, { owner, repo, number }) =>
    getRun(env, principal, owner, repo, Number(number))
  ),
  route('GET', `${run}/state`, 'optional', ({ env, principal }, { owner, repo, number }) =>
    getRunState(env, principal, owner, repo, Number(number))
  ),
  route('POST', `${run}/cancel`, 'user', ({ env, principal }, { owner, repo, number }) =>
    cancelRun(env, principal, owner, repo, Number(number))
  ),
  route('POST', `${run}/retry`, 'user', ({ env, principal }, { owner, repo, number }) =>
    retryRun(env, principal, owner, repo, Number(number))
  ),
  route('POST', `${run}/approve`, 'user', ({ env, principal }, { owner, repo, number }) =>
    approveRunChecks(env, principal, owner, repo, Number(number))
  ),
  route('GET', '/repositories/:owner/:repo/workflows', 'optional', ({ env, principal }, { owner, repo }) =>
    listWorkflows(env, principal, owner, repo)
  ),
  route('GET', workflow, 'optional', ({ env, principal, url }, { owner, repo, workflow }) =>
    getWorkflow(env, principal, owner, repo, workflow, url)
  ),
  route('POST', `${workflow}/dispatch`, 'user', ({ env, principal }, { owner, repo, workflow }) =>
    dispatchWorkflow(env, principal, owner, repo, workflow)
  ),
  route([...secretMethods], '/repositories/:owner/:repo/secrets', 'user', ({ request, env, principal }, params) =>
    repositorySecrets(request, env, principal, params.owner, params.repo)
  ),
  route([...secretMethods], '/repositories/:owner/:repo/secrets/:name', 'user', ({ request, env, principal }, p) =>
    repositorySecrets(request, env, principal, p.owner, p.repo, p.name)
  ),
  route([...secretMethods], '/organizations/:slug/secrets', 'user', ({ request, env, principal }, { slug }) =>
    organizationSecrets(request, env, principal, slug)
  ),
  route([...secretMethods], '/organizations/:slug/secrets/:name', 'user', ({ request, env, principal }, p) =>
    organizationSecrets(request, env, principal, p.slug, p.name)
  )
];
