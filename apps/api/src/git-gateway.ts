import type { Env } from './platform';

interface GatewayRequestOptions {
  attempts?: number;
  timeoutMs?: number;
}

export interface GitGatewayRequestMap {
  '/_marl/blob': { owner: string; repository: string; objectId: string };
  '/_marl/tree': { owner: string; repository: string; commitId: string; path: string };
  '/_marl/commit': { owner: string; repository: string; commitId: string };
  '/_marl/compare': { owner: string; repository: string; base: string; head: string };
  '/_marl/patch': { owner: string; repository: string; base: string; head: string; path: string };
  '/_marl/merge': { operationId: string; method: string; repositoryId: string; owner: string; repository: string; sourceBranch: string; targetBranch: string; sourceCommitId: string; targetCommitId: string; title: string; author: string };
  '/_marl/pulls/pin': { owner: string; repository: string; number: number; sourceCommitId: string; targetCommitId: string };
  '/_marl/repositories/relocate': { oldOwner: string; oldRepository: string; newOwner: string; newRepository: string };
  '/_marl/object': { repositoryId: string; objectId: string };
}

export type GitGatewayPath = keyof GitGatewayRequestMap;

function gatewayToken(env: Env) {
  const token = env.GIT_GATEWAY_TOKEN ?? (env.ENVIRONMENT === 'development' ? 'marl-local' : undefined);
  if (!token) throw new Error('GIT_GATEWAY_TOKEN is required outside development.');
  return token;
}

export async function requestGitGateway<Path extends GitGatewayPath>(env: Env, path: Path, body: GitGatewayRequestMap[Path], options: GatewayRequestOptions = {}) {
  const attempts = options.attempts ?? 1;
  const request = () => new Request(env.ENVIRONMENT === 'development' ? `${env.GIT_GATEWAY_URL}${path}` : `http://git-edge.internal${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-marl-gateway-token': gatewayToken(env) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000)
  });
  return retryGatewayRequest(() => env.ENVIRONMENT === 'development' ? fetch(request()) : env.GIT_EDGE.fetch(request()), attempts);
}

export async function retryGatewayRequest(send: () => Promise<Response>, attempts = 2) {
  let lastResponse: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await send();
      if (response.status < 500 || attempt === attempts - 1) return response;
      lastResponse = response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError;
}
