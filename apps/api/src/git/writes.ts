import type { Env } from '../core/platform';
import { requestGitGateway, type GitGatewayPath, type GitGatewayRequestMap } from './gateway';

type PullRefUpdate = {
  owner: string;
  repository: string;
  number: number;
  sourceCommitId: string;
  targetCommitId: string;
  expectedSourceCommitId?: string;
  expectedTargetCommitId?: string;
  sourceOwner?: string;
  sourceRepository?: string;
  sourceRepositoryId?: string;
};

export async function pinPullRefs(env: Env, update: PullRefUpdate) {
  return requestGatewayWrite(env, '/_marl/pulls/pin', update);
}

export async function requestGatewayWrite<
  Path extends Extract<GitGatewayPath, '/_marl/merge' | '/_marl/pulls/pin' | '/_marl/branches/advance'>
>(env: Env, path: Path, body: GitGatewayRequestMap[Path]) {
  return requestGitGateway(env, path, body, { attempts: 2, timeoutMs: 30_000 });
}
