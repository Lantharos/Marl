import { readBoundedJson } from './bounded-body';
import type { GitEdgeEnv } from './env';
import type { OrganizationQuotaState, RepositoryState } from './storage-model';
import type { UploadSession } from './upload-model';

export function repositoryState(env: GitEdgeEnv, repository: string) {
  return new StateClient(env.REPOSITORY_STATE.get(env.REPOSITORY_STATE.idFromName(repository)), env);
}

export function organizationQuota(env: GitEdgeEnv, organization: string) {
  return new StateClient(env.ORGANIZATION_QUOTAS.get(env.ORGANIZATION_QUOTAS.idFromName(organization)), env);
}

export function uploadSession(env: GitEdgeEnv, pushId: string) {
  return new StateClient(env.UPLOAD_SESSIONS.get(env.UPLOAD_SESSIONS.idFromName(pushId)), env);
}

export class StateClient {
  constructor(private stub: DurableObjectStub, private env: GitEdgeEnv) {}

  async request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
    const response = await this.stub.fetch(`http://state${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-marl-storage-token': this.env.MARL_GIT_GATEWAY_TOKEN },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const value = await readBoundedJson<Record<string, unknown>>(response, 16 * 1024 * 1024) ?? {};
    if (!response.ok) throw new StateRequestError(response.status, String(value.error ?? 'state_request_failed'), String(value.detail ?? 'Repository state request failed.'));
    return value as T;
  }
}

export class StateRequestError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export type RepositorySnapshotResponse = { state: RepositoryState };
export type OrganizationSnapshotResponse = { state: OrganizationQuotaState };
export type UploadSnapshotResponse = { session: UploadSession };
