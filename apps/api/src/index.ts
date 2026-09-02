import { authenticate } from './auth';
import { handleAccessRoute } from './access-routes';
import { handleAuth } from './auth/handler';
import { listBranchRules, putBranchRule } from './branch-rules';
import { json, problem } from './http';
import { getDashboard } from './dashboard';
import type { Env } from './platform';
import { authorizeGit, createRepository, detachRepositoryFork, forkRepository, getCommit, getRepository, getRepositoryOverview, getRepositorySettings, indexGit, listBranches, listCommits, listPendingGitIndexes, listPullSources, listRepositories, listTree, readBlob, readCommitPatch, readRepositoryIcon, renameRepository, scheduleRepositoryDeletion, setRepositoryStar, transferRepository, updateRepositoryOverview, updateRepositorySettings, uploadRepositoryIcon } from './repositories';
import { addPullComment, addThreadComment, createPull, createPullLabel, createThread, deletePullComment, deleteReviewComment, mergePull, resolveThread, reviewPull, transitionPull, updatePullComment, updatePullDetails, updatePullMetadata, updateReviewComment } from './pulls';
import { compareBranches, connectPullRealtime, getPull, getPullDiff, getPullPatch, getPullState, getPullTimeline, getPullUpdates, listAllPulls, listPulls } from './pull-queries';
import { authenticateRunner, authorizeRunnerGit, beginArtifactUpload, claimJob, completeArtifactUpload, completeJob, createEnrollment, getRunner, hasRunnerCredential, heartbeatRunner, listRunners, registerRunner, renewJob, uploadArtifactPart, uploadLog } from './runners';
import { cancelRun, downloadArtifact, getRun, getRunState, listRepositoryRuns, listRuns, readJobLogs, retryRun } from './runs';
import { connectRunRealtime } from './run-realtime';
import { dispatchWorkflow, getWorkflow, listWorkflows } from './workflows';
import { search } from './search';
import { organizationSecrets, repositorySecrets } from './secrets';
import { authorizeSsh, createSshKey, deleteSshKey, listSshKeys, signingKeys } from './ssh-keys';
import { getPublicIdentityProfile } from './public-profiles';
import { getPublicIndex } from './public-index';
import { readAvatar } from './profile';
import { readOrganizationAvatar } from './organizations';
import { getShell } from './shell';
import { addIssueComment, createIssue, createIssueLabel, deleteIssueComment, setIssueState, updateIssue, updateIssueComment, updateIssueMetadata } from './issues';
import { getIssue, getIssueTimeline, listAllIssues, listIssues } from './issue-queries';
import { listInbox, markInboxRead, updateInboxState } from './inbox';
import { createRelease, deleteRelease, downloadReleaseArchive, getRelease, getReleaseByTag, listReleases, listRepositoryTags, updateRelease } from './releases';
import { abortReleaseAssetUpload, beginReleaseAssetUpload, completeReleaseAssetUpload, deleteReleaseAsset, downloadReleaseAsset, uploadReleaseAssetPart } from './release-assets';

const worker = {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ service: 'marl-api', status: 'ok' });
    }

    if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/')) return handleAuth(request, _env);

    if (!url.pathname.startsWith('/api/v1/')) return problem(404, 'not_found', 'The requested Marl API route does not exist.');
    if (request.method === 'GET' && url.pathname === '/api/v1/auth/config')
      return json({
        emailVerificationRequired: _env.ENVIRONMENT !== 'development'
      });
    const gatewayTrusted = Boolean(_env.GIT_GATEWAY_TOKEN && request.headers.get('x-marl-gateway-token') === _env.GIT_GATEWAY_TOKEN);
    if (gatewayTrusted && request.method === 'GET' && url.pathname === '/api/v1/git/pending-indexes') return listPendingGitIndexes(_env);
    if (gatewayTrusted && request.method === 'GET' && url.pathname === '/api/v1/git/ssh/authorize') return authorizeSsh(request, _env);
    if (gatewayTrusted && request.method === 'POST' && url.pathname === '/api/v1/git/signing-keys') return signingKeys(request, _env);
    if (gatewayTrusted && request.method === 'POST' && url.pathname === '/api/v1/git/index') return indexGit(request, _env, null, true);

    const avatar = url.pathname.match(/^\/api\/v1\/avatars\/([^/]+)\/([^/]+)$/);
    const organizationAvatar = url.pathname.match(/^\/api\/v1\/organization-avatars\/([^/]+)\/([^/]+)$/);
    const repositoryIcon = url.pathname.match(/^\/api\/v1\/repository-icons\/([^/]+)\/([^/]+)$/);
    const publicIdentity = url.pathname.match(/^\/api\/v1\/profiles\/([^/]+)$/);
    const publicIndex = url.pathname === '/api/v1/public-index';
    const publicGet = request.method === 'GET' && (avatar || organizationAvatar || repositoryIcon || publicIdentity || publicIndex);
    if (publicGet) {
      const rate = await _env.RATE_LIMITER.limit({
        key: request.headers.get('cf-connecting-ip') ?? 'anonymous'
      });
      if (!rate.success) return problem(429, 'rate_limited', 'Too many requests. Try again shortly.');
      if (avatar) return readAvatar(_env, avatar[1], avatar[2]);
      if (organizationAvatar) return readOrganizationAvatar(_env, organizationAvatar[1], organizationAvatar[2]);
      if (repositoryIcon) return readRepositoryIcon(_env, repositoryIcon[1], repositoryIcon[2]);
      if (publicIdentity) return getPublicIdentityProfile(_env, decodeURIComponent(publicIdentity[1]));
      if (publicIndex) return getPublicIndex(_env);
    }

    const runnerCredential = hasRunnerCredential(request);
    const runner = runnerCredential ? await authenticateRunner(request, _env) : null;
    const principal = !runnerCredential || !runner || request.headers.has('cookie') ? await authenticate(request, _env) : null;
    if (!gatewayTrusted) {
      const rate = await _env.RATE_LIMITER.limit({
        key: principal?.id ?? runner?.id ?? request.headers.get('cf-connecting-ip') ?? 'anonymous'
      });
      if (!rate.success) return problem(429, 'rate_limited', 'Too many requests. Try again shortly.');
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/git/pending-indexes') {
      return problem(404, 'not_found', 'The requested Marl API route does not exist.');
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
      const gatewayActorId = gatewayTrusted && /^[a-z]+_[a-z0-9]{16,128}$/.test(request.headers.get('x-marl-actor-id') ?? '') ? request.headers.get('x-marl-actor-id')! : undefined;
      return authorizeGit(_env, principal, owner, repository, service, gatewayTrusted, gatewayActorId);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/git/index') {
      if (!principal && !gatewayTrusted) return problem(401, 'authentication_required', 'Authenticate the Git gateway.');
      return indexGit(request, _env, principal, gatewayTrusted);
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/git/ssh/authorize') return authorizeSsh(request, _env);
    if (request.method === 'POST' && url.pathname === '/api/v1/git/signing-keys') {
      return problem(404, 'not_found', 'The requested Marl API route does not exist.');
    }
    if (request.method === 'GET') {
      const repositoryOverview = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/overview$/);
      if (repositoryOverview) return getRepositoryOverview(_env, principal, decodeURIComponent(repositoryOverview[1]), decodeURIComponent(repositoryOverview[2]));
      const repositoryRead = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)(?:\/(branches|commits|tree|blob)(?:\/(.*))?)?$/);
      if (repositoryRead) {
        const [, encodedOwner, encodedName, resource, rest] = repositoryRead;
        const owner = decodeURIComponent(encodedOwner);
        const name = decodeURIComponent(encodedName);
        if (!resource) return getRepository(_env, principal, owner, name);
        if (resource === 'branches') return listBranches(_env, principal, owner, name);
        if (resource === 'commits') {
          if (!rest) return listCommits(_env, principal, owner, name, url);
          if (rest.endsWith('/patch')) return readCommitPatch(_env, principal, owner, name, decodeURIComponent(rest.slice(0, -6)), url);
          return getCommit(_env, principal, owner, name, decodeURIComponent(rest));
        }
        if (resource === 'tree') return listTree(_env, principal, owner, name, url);
        if (resource === 'blob' && rest) {
          const separator = rest.indexOf('/');
          if (separator > 0) return readBlob(_env, principal, owner, name, decodeURIComponent(rest.slice(0, separator)), decodeURIComponent(rest.slice(separator + 1)), ctx);
        }
      }
    }
    if (!principal) return problem(401, 'authentication_required', 'Sign in to use the Marl API.');

    if (request.method === 'GET' && url.pathname === '/api/v1/session') return json({ user: principal });
    if (request.method === 'GET' && url.pathname === '/api/v1/shell') return getShell(_env, principal);
    if (url.pathname === '/api/v1/ssh-keys') {
      if (request.method === 'GET') return listSshKeys(_env, principal);
      if (request.method === 'POST') return createSshKey(request, _env, principal);
    }
    const sshKeyRoute = url.pathname.match(/^\/api\/v1\/ssh-keys\/(sshkey_[a-z0-9]+)$/);
    if (sshKeyRoute && request.method === 'DELETE') return deleteSshKey(request, _env, principal, sshKeyRoute[1]);
    const accessRoute = await handleAccessRoute(request, _env, principal, url);
    if (accessRoute) return accessRoute;

    if (request.method === 'GET' && url.pathname === '/api/v1/dashboard') return getDashboard(_env, principal);
    if (request.method === 'GET' && url.pathname === '/api/v1/inbox') return listInbox(_env, principal, url);
    if (request.method === 'POST' && url.pathname === '/api/v1/inbox/read') return markInboxRead(_env, principal);
    const inboxItem = url.pathname.match(/^\/api\/v1\/inbox\/(issue|pull|run)\/([a-z0-9_]+)$/);
    if (request.method === 'PATCH' && inboxItem) return updateInboxState(request, _env, principal, inboxItem[1], inboxItem[2]);
    if (request.method === 'GET' && url.pathname === '/api/v1/search') return search(_env, principal, url);
    if (request.method === 'GET' && url.pathname === '/api/v1/issues') return listAllIssues(_env, principal, url);
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
    const releaseUpload = url.pathname.match(/^\/api\/v1\/release-asset-uploads\/(releaseupload_[a-z0-9]+)(?:\/(parts\/(\d+)|complete))?$/);
    if (releaseUpload) {
      if (!releaseUpload[2] && request.method === 'DELETE') return abortReleaseAssetUpload(_env, principal, releaseUpload[1]);
      if (releaseUpload[2]?.startsWith('parts/') && request.method === 'PUT') return uploadReleaseAssetPart(request, _env, principal, releaseUpload[1], Number(releaseUpload[3]));
      if (releaseUpload[2] === 'complete' && request.method === 'POST') return completeReleaseAssetUpload(_env, principal, releaseUpload[1]);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }
    const releaseAsset = url.pathname.match(/^\/api\/v1\/release-assets\/(releaseasset_[a-z0-9]+)(?:\/(download))?$/);
    if (releaseAsset) {
      if (releaseAsset[2] === 'download' && request.method === 'GET') return downloadReleaseAsset(_env, principal, releaseAsset[1]);
      if (!releaseAsset[2] && request.method === 'DELETE') return deleteReleaseAsset(_env, principal, releaseAsset[1]);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }

    const compareRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/compare$/);
    if (compareRoute && request.method === 'GET') return compareBranches(_env, principal, decodeURIComponent(compareRoute[1]), decodeURIComponent(compareRoute[2]), url);

    const runRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/runs(?:\/(\d+)(?:\/(cancel|retry|state))?)?$/);
    if (runRoute) {
      const owner = decodeURIComponent(runRoute[1]);
      const repository = decodeURIComponent(runRoute[2]);
      if (!runRoute[3] && request.method === 'GET') return listRepositoryRuns(_env, principal, owner, repository, url);
      if (runRoute[3] && !runRoute[4] && request.method === 'GET') return getRun(_env, principal, owner, repository, Number(runRoute[3]));
      if (runRoute[3] && runRoute[4] === 'state' && request.method === 'GET') return getRunState(_env, principal, owner, repository, Number(runRoute[3]));
      if (runRoute[3] && runRoute[4] === 'cancel' && request.method === 'POST') return cancelRun(_env, principal, owner, repository, Number(runRoute[3]));
      if (runRoute[3] && runRoute[4] === 'retry' && request.method === 'POST') return retryRun(_env, principal, owner, repository, Number(runRoute[3]));
    }

    const workflowRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/workflows(?:\/(workflow_[a-z0-9]+)(?:\/(dispatch))?)?$/);
    if (workflowRoute) {
      const owner = decodeURIComponent(workflowRoute[1]);
      const repository = decodeURIComponent(workflowRoute[2]);
      const workflowId = workflowRoute[3];
      const action = workflowRoute[4];
      if (!workflowId && request.method === 'GET') return listWorkflows(_env, principal, owner, repository);
      if (workflowId && !action && request.method === 'GET') return getWorkflow(_env, principal, owner, repository, workflowId, url);
      if (workflowId && action === 'dispatch' && request.method === 'POST') return dispatchWorkflow(_env, principal, owner, repository, workflowId);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }

    if (url.pathname === '/api/v1/repositories') {
      if (request.method === 'GET') return listRepositories(_env, principal, url);
      if (request.method === 'POST') return createRepository(request, _env, principal);
      return problem(405, 'method_not_allowed', 'This method is not allowed.', {
        allow: ['GET', 'POST']
      });
    }

    const repositorySecretsRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/secrets(?:\/([^/]+))?$/);
    if (repositorySecretsRoute) return repositorySecrets(request, _env, principal, decodeURIComponent(repositorySecretsRoute[1]), decodeURIComponent(repositorySecretsRoute[2]), repositorySecretsRoute[3]);
    const organizationSecretsRoute = url.pathname.match(/^\/api\/v1\/organizations\/([^/]+)\/secrets(?:\/([^/]+))?$/);
    if (organizationSecretsRoute) return organizationSecrets(request, _env, principal, decodeURIComponent(organizationSecretsRoute[1]), organizationSecretsRoute[2]);

    const branchRulesRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/branch-rules$/);
    if (branchRulesRoute) {
      const owner = decodeURIComponent(branchRulesRoute[1]);
      const repository = decodeURIComponent(branchRulesRoute[2]);
      if (request.method === 'GET') return listBranchRules(_env, principal, owner, repository);
      if (request.method === 'PUT') return putBranchRule(request, _env, principal, owner, repository);
    }

    const socialRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/(star|forks)$/);
    if (socialRoute) {
      const owner = decodeURIComponent(socialRoute[1]);
      const repository = decodeURIComponent(socialRoute[2]);
      if (socialRoute[3] === 'star' && request.method === 'PUT') return setRepositoryStar(_env, principal, owner, repository, true);
      if (socialRoute[3] === 'star' && request.method === 'DELETE') return setRepositoryStar(_env, principal, owner, repository, false);
      if (socialRoute[3] === 'forks' && request.method === 'POST') return forkRepository(request, _env, principal, owner, repository);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }
    const pullSourcesRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/pull-sources$/);
    if (pullSourcesRoute && request.method === 'GET') return listPullSources(_env, principal, decodeURIComponent(pullSourcesRoute[1]), decodeURIComponent(pullSourcesRoute[2]));

    const releaseTagLookup = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/releases\/by-tag$/);
    if (releaseTagLookup && request.method === 'GET') return getReleaseByTag(_env, principal, decodeURIComponent(releaseTagLookup[1]), decodeURIComponent(releaseTagLookup[2]), url);
    const releaseTags = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/releases\/tags$/);
    if (releaseTags && request.method === 'GET') return listRepositoryTags(_env, principal, decodeURIComponent(releaseTags[1]), decodeURIComponent(releaseTags[2]));
    const releaseUploadRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/releases\/(release_[a-z0-9]+)\/asset-uploads$/);
    if (releaseUploadRoute && request.method === 'POST') return beginReleaseAssetUpload(request, _env, principal, decodeURIComponent(releaseUploadRoute[1]), decodeURIComponent(releaseUploadRoute[2]), releaseUploadRoute[3]);
    const releaseArchiveRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/releases\/(release_[a-z0-9]+)\/archive\/(zip|tar\.gz)$/);
    if (releaseArchiveRoute && request.method === 'GET') return downloadReleaseArchive(_env, principal, decodeURIComponent(releaseArchiveRoute[1]), decodeURIComponent(releaseArchiveRoute[2]), releaseArchiveRoute[3], releaseArchiveRoute[4] as 'zip' | 'tar.gz');
    const releaseRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/releases(?:\/(release_[a-z0-9]+))?$/);
    if (releaseRoute) {
      const owner = decodeURIComponent(releaseRoute[1]);
      const repository = decodeURIComponent(releaseRoute[2]);
      const releaseId = releaseRoute[3];
      if (!releaseId && request.method === 'GET') return listReleases(_env, principal, owner, repository, url);
      if (!releaseId && request.method === 'POST') return createRelease(request, _env, principal, owner, repository);
      if (releaseId && request.method === 'GET') return getRelease(_env, principal, owner, repository, releaseId);
      if (releaseId && request.method === 'PATCH') return updateRelease(request, _env, principal, owner, repository, releaseId);
      if (releaseId && request.method === 'DELETE') return deleteRelease(_env, principal, owner, repository, releaseId);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }

    const issueRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/issues(?:\/(\d+)(?:\/(comments|metadata|labels|state|timeline))?)?$/);
    if (issueRoute) {
      const owner = decodeURIComponent(issueRoute[1]);
      const repository = decodeURIComponent(issueRoute[2]);
      const number = issueRoute[3] ? Number(issueRoute[3]) : null;
      const action = issueRoute[4];
      if (number === null && request.method === 'GET') return listIssues(_env, principal, owner, repository, url);
      if (number === null && request.method === 'POST') return createIssue(request, _env, principal, owner, repository);
      if (number !== null && !action && request.method === 'GET') return getIssue(_env, principal, owner, repository, number);
      if (number !== null && !action && request.method === 'PATCH') return updateIssue(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'comments' && request.method === 'POST') return addIssueComment(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'metadata' && request.method === 'PATCH') return updateIssueMetadata(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'labels' && request.method === 'POST') return createIssueLabel(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'state' && request.method === 'POST') return setIssueState(request, _env, principal, owner, repository, number);
      if (number !== null && action === 'timeline' && request.method === 'GET') return getIssueTimeline(_env, principal, owner, repository, number, url);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }

    const overviewRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/overview$/);
    if (overviewRoute) {
      const owner = decodeURIComponent(overviewRoute[1]);
      const repository = decodeURIComponent(overviewRoute[2]);
      if (request.method === 'GET') return getRepositoryOverview(_env, principal, owner, repository);
      if (request.method === 'PUT') return updateRepositoryOverview(request, _env, principal, owner, repository);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }

    const settingsRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/settings(?:\/(rename|transfer|detach-fork|delete))?$/);
    if (settingsRoute) {
      const owner = decodeURIComponent(settingsRoute[1]);
      const repository = decodeURIComponent(settingsRoute[2]);
      const action = settingsRoute[3];
      if (!action && request.method === 'GET') return getRepositorySettings(_env, principal, owner, repository);
      if (!action && request.method === 'PATCH') return updateRepositorySettings(request, _env, principal, owner, repository);
      if (action === 'rename' && request.method === 'POST') return renameRepository(request, _env, principal, owner, repository);
      if (action === 'transfer' && request.method === 'POST') return transferRepository(request, _env, principal, owner, repository);
      if (action === 'detach-fork' && request.method === 'POST') return detachRepositoryFork(request, _env, principal, owner, repository);
      if (action === 'delete' && request.method === 'POST') return scheduleRepositoryDeletion(request, _env, principal, owner, repository);
      return problem(405, 'method_not_allowed', 'This method is not allowed.');
    }
    const repositoryIconRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/icon$/);
    if (repositoryIconRoute && request.method === 'PUT') return uploadRepositoryIcon(request, _env, principal, decodeURIComponent(repositoryIconRoute[1]), decodeURIComponent(repositoryIconRoute[2]));

    const pullRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/pulls(?:\/(\d+)(?:\/(reviews|merge|diff|patch|threads|comments|metadata|labels|ready|close|reopen|timeline|updates|live|state))?)?$/);
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
      if (number !== null && action === 'labels' && request.method === 'POST') return createPullLabel(request, _env, principal, owner, repository, number);
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
    const issueCommentRoute = url.pathname.match(/^\/api\/v1\/issue-comments\/(comment_[a-z0-9]+)$/);
    if (issueCommentRoute && request.method === 'PATCH') return updateIssueComment(request, _env, principal, issueCommentRoute[1]);
    if (issueCommentRoute && request.method === 'DELETE') return deleteIssueComment(_env, principal, issueCommentRoute[1]);

    return problem(404, 'not_found', 'The requested Marl API route does not exist.');
  }
};

export default worker;
export { PullRoom } from './pull-room';
export { RunRoom } from './run-room';
