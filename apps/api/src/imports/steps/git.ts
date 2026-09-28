import { requestGitGateway } from '../../git/gateway';
import type { StepContext, StepResult } from './context';

export async function importGit({ env, row, token, next }: StepContext): Promise<StepResult> {
  const response = await requestGitGateway(
    env,
    '/_marl/import',
    {
      owner: row.owner,
      repository: row.name,
      repositoryId: row.repositoryId,
      actorId: row.requestedBy,
      source: `https://github.com/${row.source}`,
      token: token ?? undefined,
      defaultBranch: row.defaultBranch
    },
    { attempts: 1, timeoutMs: 900_000 }
  );
  if (!response.ok) throw new Error((await response.text()) || 'The repository could not be fetched from GitHub.');
  return { step: next(), cursor: 1 };
}
