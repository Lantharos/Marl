import type { Principal } from './auth';
import { getIssue, getIssueTimeline, listIssues } from './issue-queries';
import type { Env } from './platform';
import { connectPullRealtime, getPull, getPullDiff, getPullPatch, getPullState, getPullTimeline, getPullUpdates, listPulls } from './pull-queries';
import { downloadReleaseAsset } from './release-assets';
import { downloadReleaseArchive, getRelease, getReleaseByTag, listReleases, listRepositoryTags } from './releases';
import { getCommit, getRepository, getRepositoryOverview, listBranches, listCommits, listTree, readBlob, readCommitPatch } from './repositories';
import { connectRunRealtime } from './run-realtime';
import { downloadArtifact, getRun, getRunState, listRepositoryRuns, readJobLogs } from './runs';
import { getWorkflow, listWorkflows } from './workflows';

export async function readRepositoryRequest(
  request: Request,
  env: Env,
  principal: Principal | null,
  ctx: ExecutionContext
): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);

  const jobLogs = url.pathname.match(/^\/api\/v1\/jobs\/(job_[a-z0-9]+)\/logs$/);
  if (jobLogs) return readJobLogs(env, principal, jobLogs[1], url);
  const jobLive = url.pathname.match(/^\/api\/v1\/jobs\/(job_[a-z0-9]+)\/live$/);
  if (jobLive) return connectRunRealtime(request, env, principal, jobLive[1]);
  const artifact = url.pathname.match(/^\/api\/v1\/artifacts\/(artifact_[a-z0-9]+)$/);
  if (artifact) return downloadArtifact(env, principal, artifact[1]);
  const releaseAsset = url.pathname.match(/^\/api\/v1\/release-assets\/(releaseasset_[a-z0-9]+)\/download$/);
  if (releaseAsset) return downloadReleaseAsset(env, principal, releaseAsset[1]);

  const repositoryOverview = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/overview$/);
  if (repositoryOverview) return getRepositoryOverview(env, principal, decodeURIComponent(repositoryOverview[1]), decodeURIComponent(repositoryOverview[2]));
  const repositorySource = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)(?:\/(branches|commits|tree|blob)(?:\/(.*))?)?$/);
  if (repositorySource) {
    const [, encodedOwner, encodedName, resource, rest] = repositorySource;
    const owner = decodeURIComponent(encodedOwner);
    const name = decodeURIComponent(encodedName);
    if (!resource) return getRepository(env, principal, owner, name);
    if (resource === 'branches') return listBranches(env, principal, owner, name);
    if (resource === 'commits') {
      if (!rest) return listCommits(env, principal, owner, name, url);
      if (rest.endsWith('/patch')) return readCommitPatch(env, principal, owner, name, decodeURIComponent(rest.slice(0, -6)), url);
      return getCommit(env, principal, owner, name, decodeURIComponent(rest));
    }
    if (resource === 'tree') return listTree(env, principal, owner, name, url);
    if (resource === 'blob' && rest) {
      const separator = rest.indexOf('/');
      if (separator > 0) return readBlob(env, principal, owner, name, decodeURIComponent(rest.slice(0, separator)), decodeURIComponent(rest.slice(separator + 1)), ctx);
    }
    return null;
  }

  const runRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/runs(?:\/(\d+)(?:\/(state))?)?$/);
  if (runRoute) {
    const owner = decodeURIComponent(runRoute[1]);
    const repository = decodeURIComponent(runRoute[2]);
    if (!runRoute[3]) return listRepositoryRuns(env, principal, owner, repository, url);
    if (!runRoute[4]) return getRun(env, principal, owner, repository, Number(runRoute[3]));
    return getRunState(env, principal, owner, repository, Number(runRoute[3]));
  }

  const workflowRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/workflows(?:\/(workflow_[a-z0-9]+))?$/);
  if (workflowRoute) {
    const owner = decodeURIComponent(workflowRoute[1]);
    const repository = decodeURIComponent(workflowRoute[2]);
    return workflowRoute[3]
      ? getWorkflow(env, principal, owner, repository, workflowRoute[3], url)
      : listWorkflows(env, principal, owner, repository);
  }

  const releaseTag = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/releases\/by-tag$/);
  if (releaseTag) return getReleaseByTag(env, principal, decodeURIComponent(releaseTag[1]), decodeURIComponent(releaseTag[2]), url);
  const releaseTags = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/releases\/tags$/);
  if (releaseTags) return listRepositoryTags(env, principal, decodeURIComponent(releaseTags[1]), decodeURIComponent(releaseTags[2]));
  const releaseArchive = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/releases\/(release_[a-z0-9]+)\/archive\/(zip|tar\.gz)$/);
  if (releaseArchive) return downloadReleaseArchive(env, principal, decodeURIComponent(releaseArchive[1]), decodeURIComponent(releaseArchive[2]), releaseArchive[3], releaseArchive[4] as 'zip' | 'tar.gz');
  const releaseRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/releases(?:\/(release_[a-z0-9]+))?$/);
  if (releaseRoute) {
    const owner = decodeURIComponent(releaseRoute[1]);
    const repository = decodeURIComponent(releaseRoute[2]);
    return releaseRoute[3]
      ? getRelease(env, principal, owner, repository, releaseRoute[3])
      : listReleases(env, principal, owner, repository, url);
  }

  const issueRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/issues(?:\/(\d+)(?:\/(timeline))?)?$/);
  if (issueRoute) {
    const owner = decodeURIComponent(issueRoute[1]);
    const repository = decodeURIComponent(issueRoute[2]);
    if (!issueRoute[3]) return listIssues(env, principal, owner, repository, url);
    return issueRoute[4]
      ? getIssueTimeline(env, principal, owner, repository, Number(issueRoute[3]), url)
      : getIssue(env, principal, owner, repository, Number(issueRoute[3]));
  }

  const pullRoute = url.pathname.match(/^\/api\/v1\/repositories\/([^/]+)\/([^/]+)\/pulls(?:\/(\d+)(?:\/(diff|patch|timeline|updates|live|state))?)?$/);
  if (pullRoute) {
    const owner = decodeURIComponent(pullRoute[1]);
    const repository = decodeURIComponent(pullRoute[2]);
    const number = pullRoute[3] ? Number(pullRoute[3]) : null;
    const action = pullRoute[4];
    if (number === null) return listPulls(env, principal, owner, repository, url);
    if (!action) return getPull(env, principal, owner, repository, number);
    if (action === 'diff') return getPullDiff(env, principal, owner, repository, number);
    if (action === 'patch') return getPullPatch(env, principal, owner, repository, number, url);
    if (action === 'timeline') return getPullTimeline(env, principal, owner, repository, number, url);
    if (action === 'updates') return getPullUpdates(env, principal, owner, repository, number, url);
    if (action === 'live') return connectPullRealtime(request, env, principal, owner, repository, number);
    return getPullState(env, principal, owner, repository, number);
  }

  return null;
}
