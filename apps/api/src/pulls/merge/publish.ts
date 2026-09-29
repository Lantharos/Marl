import type { Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';
import { requestGatewayWrite } from '../../git/writes';
import type { RepositoryAccess } from '../../repositories/access/access';
import type { MergeMethod } from '../../repositories/branch-rules';
import type { PullRow } from '../context';

export type MergeCommit = { commitId: string; targetHeadId: string };
export type MergeFailure = { status: 409 | 502; code: string; message: string };

async function authorEmail(env: Env, principal: Principal) {
  const row = await env.DB.prepare(
    'SELECT email FROM user_emails WHERE user_id=? AND verified_at IS NOT NULL ORDER BY primary_email DESC,created_at LIMIT 1'
  )
    .bind(principal.id)
    .first<{ email: string }>();
  return row?.email ?? `${principal.handle}@users.marl.sh`;
}

export async function publishMergeCommit(
  env: Env,
  input: {
    principal: Principal;
    repository: RepositoryAccess;
    pull: PullRow;
    method: MergeMethod;
    targetCommitId: string;
    queueBranch?: string;
  }
): Promise<MergeCommit | MergeFailure> {
  const { principal, repository, pull, method } = input;
  const gateway = await requestGatewayWrite(env, '/_marl/merge', {
    operationId: pull.id,
    method,
    repositoryId: repository.id,
    owner: repository.owner,
    repository: repository.name,
    targetBranch: pull.targetBranch,
    sourceCommitId: pull.sourceCommitId,
    targetCommitId: input.targetCommitId,
    title:
      method === 'squash' ? `${pull.title} (!${pull.number})` : `Merge pull request !${pull.number}: ${pull.title}`,
    author: principal.handle,
    authorEmail: await authorEmail(env, principal),
    actorId: principal.id,
    ...(input.queueBranch ? { queueBranch: input.queueBranch } : {})
  });
  const result = (await gateway.json().catch(() => null)) as {
    commitId?: string;
    targetHeadId?: string;
    error?: string;
  } | null;
  if (!gateway.ok || !result?.commitId)
    return gateway.status === 409
      ? { status: 409, code: 'merge_conflict', message: result?.error ?? 'The branches conflict.' }
      : {
          status: 502,
          code: 'merge_gateway_failed',
          message: result?.error ?? 'Git gateway could not merge this pull request.'
        };
  return { commitId: result.commitId, targetHeadId: result.targetHeadId ?? result.commitId };
}
