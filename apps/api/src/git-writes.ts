import type { Env } from './platform';

export type PullRefUpdate = {
  owner: string;
  repository: string;
  number: number;
  sourceCommitId: string;
  targetCommitId: string;
  expectedSourceCommitId?: string;
  expectedTargetCommitId?: string;
};

export async function pinPullRefs(env: Env, update: PullRefUpdate) {
  return requestGatewayWrite(env, '/_sty/pulls/pin', update);
}

export async function requestGatewayWrite(env: Env, path: string, body: Record<string, unknown>) {
  return retryGatewayWrite(() => fetch(`${env.GIT_GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sty-gateway-token': env.GIT_GATEWAY_TOKEN ?? 'sty-local' },
    body: JSON.stringify(body)
  }));
}

export async function retryGatewayWrite(send: () => Promise<Response>) {
  let lastResponse: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await send();
      if (response.status < 500 || attempt === 1) return response;
      lastResponse = response;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError;
}
