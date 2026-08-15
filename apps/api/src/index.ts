import { authenticate } from './auth';
import { json, problem } from './http';
import type { Env } from './platform';
import { authorizeGit, createRepository, getCommit, getRepository, indexGit, listBranches, listCommits, listRepositories, listTree, readBlob } from './repositories';
import { compareBranches, createPull, createThread, getPull, getPullDiff, listAllPulls, listPulls, mergePull, resolveThread, reviewPull } from './pulls';
import { authenticateRunner, authorizeRunnerGit, claimJob, completeJob, createEnrollment, heartbeatRunner, listRunners, registerRunner, renewJob, uploadArtifact, uploadLog } from './runners';
import { cancelRun, createRun, downloadArtifact, getRun, listRepositoryRuns, listRuns, readJobLogs, retryRun } from './runs';

const worker = {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ service: 'sty-api', status: 'ok' });
    }

    if (!url.pathname.startsWith('/api/v1/')) return problem(404, 'not_found', 'The requested Sty API route does not exist.');
    const principal = await authenticate(request, _env);
    const runner = await authenticateRunner(request, _env);
    const gatewayTrusted = request.headers.get('x-sty-gateway-token') === (_env.GIT_GATEWAY_TOKEN ?? (_env.ENVIRONMENT === 'development' ? 'sty-local' : ''));
    if (request.method === 'POST' && url.pathname === '/api/v1/runner/register') return registerRunner(request, _env);
    if (runner && request.method === 'POST' && url.pathname === '/api/v1/runner/heartbeat') return heartbeatRunner(_env, runner);
    if (runner && request.method === 'POST' && url.pathname === '/api/v1/runner/claim') return claimJob(_env, runner);
    const runnerJob = url.pathname.match(/^\/api\/v1\/runner\/jobs\/(job_[a-z0-9]+)\/(renew|complete|logs\/(\d+)|artifacts\/(.+))$/);
    if (runner && runnerJob) {
      if (request.method === 'POST' && runnerJob[2] === 'renew') return renewJob(request, _env, runner, runnerJob[1]);
      if (request.method === 'POST' && runnerJob[2] === 'complete') return completeJob(request, _env, runner, runnerJob[1]);
      if (request.method === 'PUT' && runnerJob[3]) return uploadLog(request, _env, runner, runnerJob[1], Number(runnerJob[3]));
      if (request.method === 'PUT' && runnerJob[4]) return uploadArtifact(request, _env, runner, runnerJob[1], decodeURIComponent(runnerJob[4]));
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/git/authorize') {
      const owner = url.searchParams.get('owner');
      const repository = url.searchParams.get('repository');
      const service = url.searchParams.get('service') ?? 'git-upload-pack';
      if (!owner || !repository || !['git-upload-pack', 'git-receive-pack'].includes(service)) return problem(422, 'invalid_git_request', 'Owner, repository, or Git service is invalid.');
      if (runner && service === 'git-upload-pack') return authorizeRunnerGit(_env, runner, owner, repository);
      return authorizeGit(_env, principal, owner, repository, service, gatewayTrusted);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/git/index') {
      if (!principal && !gatewayTrusted) return problem(401, 'authentication_required', 'Authenticate the Git gateway.');
      return indexGit(request, _env, principal, gatewayTrusted);
    }
    if (!principal) return problem(401, 'authentication_required', 'Sign in to use the Sty API.');

    if (request.method === 'GET' && url.pathname === '/api/v1/pulls') return listAllPulls(_env, principal);
    if (request.method === 'GET' && url.pathname === '/api/v1/runners') return listRunners(_env, principal);
    if (request.method === 'POST' && url.pathname === '/api/v1/runner-enrollments') return createEnrollment(request, _env, principal);
    if (request.method === 'GET' && url.pathname === '/api/v1/runs') return listRuns(_env, principal);
    const jobLogs = url.pathname.match(/^\/api\/v1\/jobs\/(job_[a-z0-9]+)\/logs$/);
    if (request.method === 'GET' && jobLogs) return readJobLogs(_env, principal, jobLogs[1]);
    const artifact = url.pathname.match(/^\/api\/v1\/artifacts\/(artifact_[a-z0-9]+)$/);
    if (request.method === 'GET' && artifact) return downloadArtifact(_env, principal, artifact[1]);

    const compareRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/compare$/);
    if (compareRoute && request.method === 'GET') return compareBranches(_env, principal, decodeURIComponent(compareRoute[1]), decodeURIComponent(compareRoute[2]), url);

    const runRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/runs(?:\/(\d+)(?:\/(cancel|retry))?)?$/);
    if (runRoute) {
      const owner = decodeURIComponent(runRoute[1]); const repository = decodeURIComponent(runRoute[2]);
      if (!runRoute[3] && request.method === 'GET') return listRepositoryRuns(_env, principal, owner, repository);
      if (!runRoute[3] && request.method === 'POST') return createRun(request, _env, principal, owner, repository);
      if (runRoute[3] && !runRoute[4] && request.method === 'GET') return getRun(_env, principal, owner, repository, Number(runRoute[3]));
      if (runRoute[3] && runRoute[4] === 'cancel' && request.method === 'POST') return cancelRun(_env, principal, owner, repository, Number(runRoute[3]));
      if (runRoute[3] && runRoute[4] === 'retry' && request.method === 'POST') return retryRun(_env, principal, owner, repository, Number(runRoute[3]));
    }

    if (url.pathname === '/api/v1/repositories') {
      if (request.method === 'GET') return listRepositories(_env, principal);
      if (request.method === 'POST') return createRepository(request, _env, principal);
      return problem(405, 'method_not_allowed', 'This method is not allowed.', { allow: ['GET', 'POST'] });
    }

    const pullRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/pulls(?:\/(\d+)(?:\/(reviews|merge|diff|threads))?)?$/);
    if (pullRoute) {
      const owner = decodeURIComponent(pullRoute[1]);
      const repository = decodeURIComponent(pullRoute[2]);
      const number = pullRoute[3] ? Number(pullRoute[3]) : null;
      const action = pullRoute[4];
      if (number === null && request.method === 'GET') return listPulls(_env, principal, owner, repository);
      if (number === null && request.method === 'POST') return createPull(request, _env, principal, owner, repository);
      if (number !== null && !action && request.method === 'GET') return getPull(_env, principal, owner, repository, number);
      if (number !== null && action === 'reviews' && request.method === 'POST') return reviewPull(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'merge' && request.method === 'POST') return mergePull(_env, principal, owner, repository, number);
      if (number !== null && action === 'diff' && request.method === 'GET') return getPullDiff(_env, principal, owner, repository, number);
      if (number !== null && action === 'threads' && request.method === 'POST') return createThread(request, _env, principal, owner, repository, number);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }
    const threadRoute = url.pathname.match(/^\/api\/v1\/review-threads\/(thread_[a-z0-9]+)\/resolve$/);
    if (threadRoute && request.method === 'POST') return resolveThread(_env, principal, threadRoute[1]);

    const match = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)(?:\/(branches|commits|tree|blob)(?:\/(.*))?)?$/);
    if (match) {
      const [, encodedOwner, encodedName, resource, rest] = match;
      const owner = decodeURIComponent(encodedOwner);
      const name = decodeURIComponent(encodedName);
      if (!resource && request.method === 'GET') return getRepository(_env, principal, owner, name);
      if (resource === 'branches' && request.method === 'GET') return listBranches(_env, principal, owner, name);
      if (resource === 'commits' && request.method === 'GET') return rest ? getCommit(_env, principal, owner, name, decodeURIComponent(rest)) : listCommits(_env, principal, owner, name, url);
      if (resource === 'tree' && request.method === 'GET') return listTree(_env, principal, owner, name, url);
      if (resource === 'blob' && rest && request.method === 'GET') {
        const separator = rest.indexOf('/');
        if (separator > 0) return readBlob(_env, principal, owner, name, decodeURIComponent(rest.slice(0, separator)), decodeURIComponent(rest.slice(separator + 1)));
      }
    }

    return problem(404, 'not_found', 'The requested Sty API route does not exist.');
  }
};

export default worker;
