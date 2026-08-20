import { authenticate } from './auth';
import { handleAccessRoute } from './access-routes';
import { handleAuth } from './auth/handler';
import { listBranchRules, putBranchRule } from './branch-rules';
import { json, problem } from './http';
import { getDashboard } from './dashboard';
import type { Env } from './platform';
import { authorizeGit, createRepository, detachRepositoryFork, forkRepository, getCommit, getRepository, getRepositoryOverview, getRepositorySettings, indexGit, listBranches, listCommits, listPendingGitIndexes, listPullSources, listRepositories, listTree, readBlob, readCommitPatch, renameRepository, scheduleRepositoryDeletion, setRepositoryStar, transferRepository, updateRepositoryOverview, updateRepositorySettings } from './repositories';
import { addPullComment, addThreadComment, createPull, createThread, deletePullComment, deleteReviewComment, mergePull, resolveThread, reviewPull, transitionPull, updatePullComment, updatePullDetails, updatePullMetadata, updateReviewComment } from './pulls';
import { compareBranches, connectPullRealtime, getPull, getPullDiff, getPullPatch, getPullState, getPullTimeline, getPullUpdates, listAllPulls, listPulls } from './pull-queries';
import { authenticateRunner, authorizeRunnerGit, beginArtifactUpload, claimJob, completeArtifactUpload, completeJob, createEnrollment, getRunner, heartbeatRunner, listRunners, registerRunner, renewJob, uploadArtifactPart, uploadLog } from './runners';
import { cancelRun, downloadArtifact, getRun, getRunState, listRepositoryRuns, listRuns, readJobLogs, retryRun } from './runs';
import { connectRunRealtime } from './run-realtime';
import { dispatchWorkflow, getWorkflow, listWorkflows } from './workflows';
import { search } from './search';
import { organizationSecrets, repositorySecrets } from './secrets';
import { authorizeSsh, createSshKey, deleteSshKey, listSshKeys, signingKeys } from './ssh-keys';
import { getPublicIdentityProfile } from './public-profiles';
import { readAvatar } from './profile';
import { readOrganizationAvatar } from './organizations';

const worker = {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ service: 'marl-api', status: 'ok' });
    }

    if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/')) return handleAuth(request, _env);

    if (!url.pathname.startsWith('/api/v1/')) return problem(404, 'not_found', 'The requested Marl API route does not exist.');
    if (request.method === 'GET' && url.pathname === '/api/v1/auth/methods') return json({ password: true, passkey: true, ave: Boolean(_env.AVE_CLIENT_ID && _env.AVE_CLIENT_SECRET), emailVerificationRequired: _env.ENVIRONMENT !== 'development' });
    const gatewayTrusted = Boolean(_env.GIT_GATEWAY_TOKEN && request.headers.get('x-marl-gateway-token') === _env.GIT_GATEWAY_TOKEN);
    const principal = await authenticate(request, _env);
    const runner = await authenticateRunner(request, _env);
    if (!gatewayTrusted) {
      const rate = await _env.RATE_LIMITER.limit({ key: principal?.id ?? runner?.id ?? request.headers.get('cf-connecting-ip') ?? 'anonymous' });
      if (!rate.success) return problem(429, 'rate_limited', 'Too many requests. Try again shortly.');
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/git/pending-indexes') {
      if (!gatewayTrusted) return problem(404, 'not_found', 'The requested Marl API route does not exist.');
      return listPendingGitIndexes(_env);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/runner/register') return registerRunner(request, _env);
    if (runner && request.method === 'POST' && url.pathname === '/api/v1/runner/heartbeat') return heartbeatRunner(_env, runner);
    if (runner && request.method === 'POST' && url.pathname === '/api/v1/runner/claim') return claimJob(_env, runner);
    const runnerJob = url.pathname.match(/^\/api\/v1\/runner\/jobs\/(job_[a-z0-9]+)\/(renew|complete|logs\/(\d+))$/);
    if (runner && runnerJob) {
      if (request.method === 'POST' && runnerJob[2] === 'renew') return renewJob(request, _env, runner, runnerJob[1]);
      if (request.method === 'POST' && runnerJob[2] === 'complete') return completeJob(request, _env, runner, runnerJob[1]);
      if (request.method === 'PUT' && runnerJob[3]) return uploadLog(request, _env, runner, runnerJob[1], Number(runnerJob[3]));
    }
    const artifactUpload = url.pathname.match(/^\/api\/v1\/runner\/jobs\/(job_[a-z0-9]+)\/artifacts(?:\/(artifact_[a-z0-9]+)(?:\/parts\/(\d+)|\/complete)?)?$/);
    if (runner && artifactUpload) {
      if (request.method === 'POST' && !artifactUpload[2]) return beginArtifactUpload(request, _env, runner, artifactUpload[1]);
      if (request.method === 'PUT' && artifactUpload[2] && artifactUpload[3]) return uploadArtifactPart(request, _env, runner, artifactUpload[1], artifactUpload[2], Number(artifactUpload[3]));
      if (request.method === 'POST' && artifactUpload[2] && url.pathname.endsWith('/complete')) return completeArtifactUpload(request, _env, runner, artifactUpload[1], artifactUpload[2]);
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
    if (request.method === 'GET' && url.pathname === '/api/v1/git/ssh/authorize') return authorizeSsh(request, _env);
    if (request.method === 'POST' && url.pathname === '/api/v1/git/signing-keys') {
      if (!gatewayTrusted) return problem(404, 'not_found', 'The requested Marl API route does not exist.');
      return signingKeys(request, _env);
    }
    const avatar = url.pathname.match(/^\/api\/v1\/avatars\/([^/]+)\/([^/]+)$/);
    if (avatar && request.method === 'GET') return readAvatar(_env, avatar[1], avatar[2]);
    const organizationAvatar = url.pathname.match(/^\/api\/v1\/organization-avatars\/([^/]+)\/([^/]+)$/);
    if (organizationAvatar && request.method === 'GET') return readOrganizationAvatar(_env, organizationAvatar[1], organizationAvatar[2]);
    const publicIdentity = url.pathname.match(/^\/api\/v1\/profiles\/([^/]+)$/);
    if (publicIdentity && request.method === 'GET') return getPublicIdentityProfile(_env, decodeURIComponent(publicIdentity[1]));
    if (!principal) return problem(401, 'authentication_required', 'Sign in to use the Marl API.');

    if (request.method === 'GET' && url.pathname === '/api/v1/session') return json({ user: principal });
    if (url.pathname === '/api/v1/ssh-keys') {
      if (request.method === 'GET') return listSshKeys(_env, principal);
      if (request.method === 'POST') return createSshKey(request, _env, principal);
    }
    const sshKeyRoute = url.pathname.match(/^\/api\/v1\/ssh-keys\/(sshkey_[a-z0-9]+)$/);
    if (sshKeyRoute && request.method === 'DELETE') return deleteSshKey(request, _env, principal, sshKeyRoute[1]);
    const accessRoute = await handleAccessRoute(request, _env, principal, url);
    if (accessRoute) return accessRoute;

    if (request.method === 'GET' && url.pathname === '/api/v1/dashboard') return getDashboard(_env, principal);
    if (request.method === 'GET' && url.pathname === '/api/v1/search') return search(_env, principal, url);
    if (request.method === 'GET' && url.pathname === '/api/v1/pulls') return listAllPulls(_env, principal, url);
    if (request.method === 'GET' && url.pathname === '/api/v1/runners') return listRunners(_env, principal);
    const runnerDetail = url.pathname.match(/^\/api\/v1\/runners\/(runner_[a-z0-9]+)$/);
    if (request.method === 'GET' && runnerDetail) return getRunner(_env, principal, runnerDetail[1]);
    if (request.method === 'POST' && url.pathname === '/api/v1/runner-enrollments') return createEnrollment(request, _env, principal);
    if (request.method === 'GET' && url.pathname === '/api/v1/runs') return listRuns(_env, principal, url);
    const jobLogs = url.pathname.match(/^\/api\/v1\/jobs\/(job_[a-z0-9]+)\/logs$/);
    if (request.method === 'GET' && jobLogs) return readJobLogs(_env, principal, jobLogs[1], url);
    const jobLive = url.pathname.match(/^\/api\/v1\/jobs\/(job_[a-z0-9]+)\/live$/);
    if (request.method === 'GET' && jobLive) return connectRunRealtime(request, _env, principal, jobLive[1]);
    const artifact = url.pathname.match(/^\/api\/v1\/artifacts\/(artifact_[a-z0-9]+)$/);
    if (request.method === 'GET' && artifact) return downloadArtifact(_env, principal, artifact[1]);

    const compareRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/compare$/);
    if (compareRoute && request.method === 'GET') return compareBranches(_env, principal, decodeURIComponent(compareRoute[1]), decodeURIComponent(compareRoute[2]), url);

    const runRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/runs(?:\/(\d+)(?:\/(cancel|retry|state))?)?$/);
    if (runRoute) {
      const owner = decodeURIComponent(runRoute[1]); const repository = decodeURIComponent(runRoute[2]);
      if (!runRoute[3] && request.method === 'GET') return listRepositoryRuns(_env, principal, owner, repository, url);
      if (runRoute[3] && !runRoute[4] && request.method === 'GET') return getRun(_env, principal, owner, repository, Number(runRoute[3]));
      if (runRoute[3] && runRoute[4] === 'state' && request.method === 'GET') return getRunState(_env, principal, owner, repository, Number(runRoute[3]));
      if (runRoute[3] && runRoute[4] === 'cancel' && request.method === 'POST') return cancelRun(_env, principal, owner, repository, Number(runRoute[3]));
      if (runRoute[3] && runRoute[4] === 'retry' && request.method === 'POST') return retryRun(_env, principal, owner, repository, Number(runRoute[3]));
    }

    const workflowRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/workflows(?:\/(workflow_[a-z0-9]+)(?:\/(dispatch))?)?$/);
    if (workflowRoute) {
      const owner = decodeURIComponent(workflowRoute[1]); const repository = decodeURIComponent(workflowRoute[2]); const workflowId = workflowRoute[3]; const action = workflowRoute[4];
      if (!workflowId && request.method === 'GET') return listWorkflows(_env, principal, owner, repository);
      if (workflowId && !action && request.method === 'GET') return getWorkflow(_env, principal, owner, repository, workflowId, url);
      if (workflowId && action === 'dispatch' && request.method === 'POST') return dispatchWorkflow(_env, principal, owner, repository, workflowId);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }

    if (url.pathname === '/api/v1/repositories') {
      if (request.method === 'GET') return listRepositories(_env, principal, url);
      if (request.method === 'POST') return createRepository(request, _env, principal);
      return problem(405, 'method_not_allowed', 'This method is not allowed.', { allow: ['GET', 'POST'] });
    }

    const repositorySecretsRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/secrets(?:\/([^/]+))?$/);
    if (repositorySecretsRoute) return repositorySecrets(request, _env, principal, decodeURIComponent(repositorySecretsRoute[1]), decodeURIComponent(repositorySecretsRoute[2]), repositorySecretsRoute[3]);
    const organizationSecretsRoute = url.pathname.match(/^\/api\/v1\/organizations\/([^/]+)\/secrets(?:\/([^/]+))?$/);
    if (organizationSecretsRoute) return organizationSecrets(request, _env, principal, decodeURIComponent(organizationSecretsRoute[1]), organizationSecretsRoute[2]);

    const branchRulesRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/branch-rules$/);
    if (branchRulesRoute) {
      const owner = decodeURIComponent(branchRulesRoute[1]); const repository = decodeURIComponent(branchRulesRoute[2]);
      if (request.method === 'GET') return listBranchRules(_env, principal, owner, repository);
      if (request.method === 'PUT') return putBranchRule(request, _env, principal, owner, repository);
    }

    const socialRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/(star|forks)$/);
    if (socialRoute) {
      const owner = decodeURIComponent(socialRoute[1]); const repository = decodeURIComponent(socialRoute[2]);
      if (socialRoute[3] === 'star' && request.method === 'PUT') return setRepositoryStar(_env, principal, owner, repository, true);
      if (socialRoute[3] === 'star' && request.method === 'DELETE') return setRepositoryStar(_env, principal, owner, repository, false);
      if (socialRoute[3] === 'forks' && request.method === 'POST') return forkRepository(request, _env, principal, owner, repository);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }
    const pullSourcesRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/pull-sources$/);
    if (pullSourcesRoute && request.method === 'GET') return listPullSources(_env, principal, decodeURIComponent(pullSourcesRoute[1]), decodeURIComponent(pullSourcesRoute[2]));

    const overviewRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/overview$/);
    if (overviewRoute) {
      const owner = decodeURIComponent(overviewRoute[1]); const repository = decodeURIComponent(overviewRoute[2]);
      if (request.method === 'GET') return getRepositoryOverview(_env, principal, owner, repository);
      if (request.method === 'PUT') return updateRepositoryOverview(request, _env, principal, owner, repository);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }

    const settingsRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/settings(?:\/(rename|transfer|detach-fork|delete))?$/);
    if (settingsRoute) {
      const owner = decodeURIComponent(settingsRoute[1]); const repository = decodeURIComponent(settingsRoute[2]); const action = settingsRoute[3];
      if (!action && request.method === 'GET') return getRepositorySettings(_env, principal, owner, repository);
      if (!action && request.method === 'PATCH') return updateRepositorySettings(request, _env, principal, owner, repository);
      if (action === 'rename' && request.method === 'POST') return renameRepository(request, _env, principal, owner, repository);
      if (action === 'transfer' && request.method === 'POST') return transferRepository(request, _env, principal, owner, repository);
      if (action === 'detach-fork' && request.method === 'POST') return detachRepositoryFork(request, _env, principal, owner, repository);
      if (action === 'delete' && request.method === 'POST') return scheduleRepositoryDeletion(request, _env, principal, owner, repository);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }

    const pullRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/pulls(?:\/(\d+)(?:\/(reviews|merge|diff|patch|threads|comments|metadata|ready|close|reopen|timeline|updates|live|state))?)?$/);
    if (pullRoute) {
      const owner = decodeURIComponent(pullRoute[1]);
      const repository = decodeURIComponent(pullRoute[2]);
      const number = pullRoute[3] ? Number(pullRoute[3]) : null;
      const action = pullRoute[4];
      if (number === null && request.method === 'GET') return listPulls(_env, principal, owner, repository, url);
      if (number === null && request.method === 'POST') return createPull(request, _env, principal, owner, repository);
      if (number !== null && !action && request.method === 'GET') return getPull(_env, principal, owner, repository, number);
      if (number !== null && !action && request.method === 'PATCH') return updatePullDetails(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'reviews' && request.method === 'POST') return reviewPull(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'merge' && request.method === 'POST') return mergePull(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'diff' && request.method === 'GET') return getPullDiff(_env, principal, owner, repository, number);
      if (number !== null && action === 'patch' && request.method === 'GET') return getPullPatch(_env, principal, owner, repository, number, url);
      if (number !== null && action === 'timeline' && request.method === 'GET') return getPullTimeline(_env, principal, owner, repository, number, url);
      if (number !== null && action === 'updates' && request.method === 'GET') return getPullUpdates(_env, principal, owner, repository, number, url);
      if (number !== null && action === 'live' && request.method === 'GET') return connectPullRealtime(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'state' && request.method === 'GET') return getPullState(_env, principal, owner, repository, number);
      if (number !== null && action === 'threads' && request.method === 'POST') return createThread(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'comments' && request.method === 'POST') return addPullComment(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'metadata' && request.method === 'PATCH') return updatePullMetadata(request, _env, principal, owner, repository, number);
      if (number !== null && ['ready', 'close', 'reopen'].includes(action ?? '') && request.method === 'POST') return transitionPull(_env, principal, owner, repository, number, action as 'ready' | 'close' | 'reopen');
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }
    const threadRoute = url.pathname.match(/^\/api\/v1\/review-threads\/(thread_[a-z0-9]+)\/(resolve|comments)$/);
    if (threadRoute && request.method === 'POST' && threadRoute[2] === 'resolve') return resolveThread(request, _env, principal, threadRoute[1]);
    if (threadRoute && request.method === 'POST' && threadRoute[2] === 'comments') return addThreadComment(request, _env, principal, threadRoute[1]);
    const commentRoute = url.pathname.match(/^\/api\/v1\/review-comments\/(comment_[a-z0-9]+)$/);
    if (commentRoute && request.method === 'PATCH') return updateReviewComment(request, _env, principal, commentRoute[1]);
    if (commentRoute && request.method === 'DELETE') return deleteReviewComment(_env, principal, commentRoute[1]);
    const pullCommentRoute = url.pathname.match(/^\/api\/v1\/pull-comments\/(comment_[a-z0-9]+)$/);
    if (pullCommentRoute && request.method === 'PATCH') return updatePullComment(request, _env, principal, pullCommentRoute[1]);
    if (pullCommentRoute && request.method === 'DELETE') return deletePullComment(_env, principal, pullCommentRoute[1]);

    const match = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)(?:\/(branches|commits|tree|blob)(?:\/(.*))?)?$/);
    if (match) {
      const [, encodedOwner, encodedName, resource, rest] = match;
      const owner = decodeURIComponent(encodedOwner);
      const name = decodeURIComponent(encodedName);
      if (!resource && request.method === 'GET') return getRepository(_env, principal, owner, name);
      if (resource === 'branches' && request.method === 'GET') return listBranches(_env, principal, owner, name);
      if (resource === 'commits' && request.method === 'GET') {
        if (!rest) return listCommits(_env, principal, owner, name, url);
        if (rest.endsWith('/patch')) return readCommitPatch(_env, principal, owner, name, decodeURIComponent(rest.slice(0, -6)), url);
        return getCommit(_env, principal, owner, name, decodeURIComponent(rest));
      }
      if (resource === 'tree' && request.method === 'GET') return listTree(_env, principal, owner, name, url);
      if (resource === 'blob' && rest && request.method === 'GET') {
        const separator = rest.indexOf('/');
        if (separator > 0) return readBlob(_env, principal, owner, name, decodeURIComponent(rest.slice(0, separator)), decodeURIComponent(rest.slice(separator + 1)), ctx);
      }
    }

    return problem(404, 'not_found', 'The requested Marl API route does not exist.');
  }
};

export default worker;
export { PullRoom } from './pull-room';
export { RunRoom } from './run-room';
