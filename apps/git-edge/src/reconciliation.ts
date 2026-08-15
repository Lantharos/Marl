import { StateClient, StateRequestError, type RepositorySnapshotResponse } from './state-client';
import type { RepositoryState } from './storage-model';

export type CommittedPush = {
  generation: number;
  actualBytes: number;
  accountingDelta: number;
  manifestKey: string;
  manifestHash: string;
  committedAt: number;
};

export type PublicationFailureDisposition = 'published' | 'discard' | 'defer';
export type PublicationResolution<T> = { value: T; recovered: CommittedPush | null };

export function publicationFailureDisposition(error: unknown, committed: CommittedPush | null): PublicationFailureDisposition {
  if (committed) return 'published';
  return error instanceof StateRequestError ? 'discard' : 'defer';
}

export async function publishWithReconciliation<T>(operations: {
  publish: () => Promise<T>;
  readCommitted: () => Promise<CommittedPush | null>;
  recover: (committed: CommittedPush) => Promise<T>;
  discard: () => Promise<void>;
}): Promise<PublicationResolution<T>> {
  try {
    return { value: await operations.publish(), recovered: null };
  } catch (error) {
    const committed = await operations.readCommitted();
    const disposition = publicationFailureDisposition(error, committed);
    if (disposition === 'published' && committed) return { value: await operations.recover(committed), recovered: committed };
    if (disposition === 'discard') await operations.discard();
    throw error;
  }
}

export async function committedPush(repository: StateClient, pushId: string): Promise<CommittedPush | null> {
  try {
    return (await repository.request<{ committed: CommittedPush }>('/committed', { pushId })).committed;
  } catch (error) {
    if (error instanceof StateRequestError && error.status === 404) return null;
    throw error;
  }
}

export async function recoverCommittedState(repository: StateClient, committed: CommittedPush): Promise<RepositoryState> {
  const snapshot = await repository.request<RepositorySnapshotResponse>('/snapshot');
  if (snapshot.state.generation < committed.generation) throw new Error('Repository state is older than its committed publication record.');
  if (snapshot.state.generation === committed.generation && (snapshot.state.manifestKey !== committed.manifestKey || snapshot.state.manifestHash !== committed.manifestHash)) {
    throw new Error('Repository state does not match its committed publication record.');
  }
  return snapshot.state;
}

export async function acknowledgeCommittedPush(repository: StateClient, pushId: string) {
  await repository.request('/acknowledge', { pushId });
}
