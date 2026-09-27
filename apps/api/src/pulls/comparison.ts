import type { Principal } from '../auth/principal';
import { safeRepositoryPath, validBranchName } from '../core/domain';
import { requestGitGateway } from '../git/gateway';
import { json, problem, readJsonValue } from '../http/http';
import type { Env } from '../core/platform';
import { pullRepository as repo } from './context';
import { allPullThreads } from './timeline';
import { authorizeRepository } from '../repositories/access/access';

export async function getPullDiff(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  number: number
): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read')))
    return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(
    'SELECT id,source_commit_id AS sourceCommitId,target_commit_id AS targetCommitId FROM pull_requests WHERE repository_id=? AND number=?'
  )
    .bind(repository.id, number)
    .first<{ id: string; sourceCommitId: string; targetCommitId: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const response = await requestGitGateway(
    env,
    '/_marl/compare',
    { owner, repository: name, base: pull.targetCommitId, head: pull.sourceCommitId },
    { attempts: 2 }
  );
  if (!response.ok) return problem(502, 'diff_gateway_failed', 'Git gateway could not build this comparison.');
  const [diff, timelineThreads] = await Promise.all([
    readJsonValue<Record<string, unknown>>(response, 16 * 1024 * 1024),
    allPullThreads(env, principal, pull.id, { owner, repository: name })
  ]);
  if (!diff) return problem(502, 'diff_gateway_failed', 'Git gateway returned an invalid or oversized comparison.');
  return json({ ...diff, threads: timelineThreads.map((item) => item.value) });
}

export async function getPullPatch(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  number: number,
  url: URL
): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read')))
    return problem(404, 'repository_not_found', 'Repository not found.');
  const path = url.searchParams.get('path') ?? '';
  if (!safeRepositoryPath(path)) return problem(422, 'invalid_path', 'Repository path is invalid.');
  const pull = await env.DB.prepare(
    'SELECT source_commit_id AS sourceCommitId,target_commit_id AS targetCommitId FROM pull_requests WHERE repository_id=? AND number=?'
  )
    .bind(repository.id, number)
    .first<{ sourceCommitId: string; targetCommitId: string }>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const requestedRevision = url.searchParams.get('revision');
  if (requestedRevision && !/^[0-9a-f]{40,64}$/.test(requestedRevision))
    return problem(422, 'invalid_revision', 'Revision is invalid.');
  const revision =
    requestedRevision && requestedRevision !== pull.sourceCommitId
      ? await env.DB.prepare(
          `SELECT json_extract(details,'$.head') AS head,json_extract(details,'$.base') AS base FROM pull_request_events WHERE pull_request_id=(SELECT id FROM pull_requests WHERE repository_id=? AND number=?) AND kind IN ('commits_added','head_updated') AND json_extract(details,'$.head')=? ORDER BY created_at DESC LIMIT 1`
        )
          .bind(repository.id, number, requestedRevision)
          .first<{ head: string; base: string }>()
      : { head: pull.sourceCommitId, base: pull.targetCommitId };
  if (!revision?.head || !revision.base) return problem(404, 'revision_not_found', 'Revision not found.');
  const response = await requestGitGateway(
    env,
    '/_marl/patch',
    { owner, repository: name, base: revision.base, head: revision.head, path },
    { attempts: 2 }
  ).catch(() => null);
  if (!response?.ok) return problem(502, 'patch_gateway_failed', 'Git gateway could not read this file diff.');
  return new Response(response.body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export async function compareBranches(
  env: Env,
  principal: Principal,
  owner: string,
  name: string,
  url: URL
): Promise<Response> {
  const repository = await repo(env, owner, name);
  if (!repository || !(await authorizeRepository(env, principal, owner, name, 'repository.read')))
    return problem(404, 'repository_not_found', 'Repository not found.');
  const base = url.searchParams.get('base');
  const head = url.searchParams.get('head');
  const sourceParts = (url.searchParams.get('sourceRepository') ?? `${owner}/${name}`).split('/');
  if (!validBranchName(base) || !validBranchName(head) || sourceParts.length !== 2)
    return problem(422, 'invalid_comparison', 'Choose valid repositories and branches.');
  const sourceRepository = await repo(env, sourceParts[0], sourceParts[1]);
  if (
    !sourceRepository ||
    !(await authorizeRepository(env, principal, sourceParts[0], sourceParts[1], 'repository.read'))
  )
    return problem(404, 'repository_not_found', 'Source repository not found.');
  if ((await comparisonRoot(env, sourceRepository.id)) !== (await comparisonRoot(env, repository.id)))
    return problem(422, 'unrelated_repositories', 'These repositories are not in the same fork network.');
  if (sourceRepository.id === repository.id && base === head)
    return problem(422, 'invalid_comparison', 'Choose two different branches.');
  const [baseBranch, headBranch] = await Promise.all([
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?')
      .bind(repository.id, base)
      .first<{ name: string; commitId: string }>(),
    env.DB.prepare('SELECT name,commit_id AS commitId FROM branches WHERE repository_id=? AND name=?')
      .bind(sourceRepository.id, head)
      .first<{ name: string; commitId: string }>()
  ]);
  if (!baseBranch || !headBranch) return problem(404, 'branch_not_found', 'A comparison branch does not exist.');
  const response = await requestGitGateway(
    env,
    '/_marl/compare',
    {
      owner,
      repository: name,
      base: baseBranch.commitId,
      head: headBranch.commitId,
      ...(sourceRepository.id === repository.id
        ? {}
        : { sourceOwner: sourceParts[0], sourceRepository: sourceParts[1], sourceRepositoryId: sourceRepository.id })
    },
    { attempts: 2 }
  );
  if (!response.ok) return problem(502, 'diff_gateway_failed', 'Git gateway could not build this comparison.');
  const comparison = await readJsonValue<Record<string, unknown>>(response, 16 * 1024 * 1024);
  return comparison
    ? json(comparison)
    : problem(502, 'diff_gateway_failed', 'Git gateway returned an invalid or oversized comparison.');
}

async function comparisonRoot(env: Env, repositoryId: string) {
  return (
    (
      await env.DB.prepare('SELECT COALESCE(fork_root_repository_id,id) AS rootId FROM repositories WHERE id=?')
        .bind(repositoryId)
        .first<{ rootId: string }>()
    )?.rootId ?? ''
  );
}
