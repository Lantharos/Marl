import type { Principal } from './auth';
import { requestGitGateway } from './git-gateway';
import { json, problem, readJsonValue } from './http';
import type { Env } from './platform';
import { authorizeRepository } from './repository-access';

export async function getPullMergeability(env: Env, principal: Principal | null, owner: string, name: string, number: number, url: URL) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare('SELECT source_commit_id AS head,target_commit_id AS base FROM pull_requests WHERE repository_id=? AND number=?').bind(repository.id, number).first<{ head: string; base: string }>();
  if (!pull) return problem(404, 'pull_not_found', 'Pull not found.');
  if (url.searchParams.get('head') !== pull.head || url.searchParams.get('base') !== pull.base) return problem(409, 'revision_changed', 'The pull revision changed.');
  const response = await requestGitGateway(env, '/_marl/mergeability', { owner, repository: name, ...pull });
  if (!response.ok) { await response.body?.cancel(); return problem(502, 'mergeability_unavailable', 'Merge conflicts could not be checked.'); }
  const result = await readJsonValue<{ conflicted?: boolean }>(response, 4096);
  if (typeof result?.conflicted !== 'boolean') return problem(502, 'mergeability_unavailable', 'Merge conflicts could not be checked.');
  return json({ ...pull, conflicted: result.conflicted }, { headers: { 'cache-control': 'private, max-age=60', vary: 'Cookie, Authorization' } });
}
