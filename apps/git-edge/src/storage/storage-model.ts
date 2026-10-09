export const STORAGE_LIMITS = {
  repositoryBytes: 2 * 1024 * 1024 * 1024,
  organizationBytes: 10 * 1024 * 1024 * 1024,
  pushBytes: 256 * 1024 * 1024,
  expandedPushBytes: 1024 * 1024 * 1024,
  blobBytes: 100 * 1024 * 1024,
  objectsPerPush: 50_000,
  refsPerPush: 32,
  refsPerRepository: 100_000,
  packsPerGeneration: 16,
  partBytes: 64 * 1024 * 1024,
  partsPerPack: 10_000,
  activeUploadsPerOrganization: 4,
  uploadAttemptsPerPart: 3,
  leaseSeconds: 15 * 60
} as const;

type GitHash = string;

export type PackDescriptor = {
  id: string;
  packKey: string;
  indexKey: string;
  objectIndexKey: string;
  compressedBytes: number;
  expandedBytes: number;
  objectCount: number;
  largestBlobBytes: number;
};

type PushLease = {
  id: string;
  reservationId: string;
  expectedGeneration: number;
  expiresAt: number;
  proposedRefs: Record<string, GitHash>;
};

export type RepositoryState = {
  generation: number;
  refsVersion: number;
  refs: Record<string, GitHash>;
  manifestKey: string | null;
  manifestHash: string | null;
  packs: PackDescriptor[];
  storedBytes: number;
  activePush: PushLease | null;
};

export type StorageReservation = {
  id: string;
  repository: string;
  maximumBytes: number;
  expiresAt: number;
  state: 'reserved' | 'committed';
  actualBytes?: number;
};

export type OrganizationQuotaState = {
  usedBytes: number;
  reservations: Record<string, StorageReservation>;
  adjustments: Record<string, number>;
};

export type Publication = {
  pushId: string;
  expectedGeneration: number;
  refs: Record<string, GitHash>;
  manifestKey: string;
  manifestHash: string;
  packs: PackDescriptor[];
};

export function beginPush(
  state: RepositoryState,
  lease: Omit<PushLease, 'expectedGeneration'>,
  expectedRefs: Record<string, GitHash | null>,
  now: number
): RepositoryState {
  const current = expirePush(state, now);
  if (current.activePush && current.activePush.id !== lease.id)
    throw new StorageError('push_in_progress', 'Another push is already changing this repository.');
  validateRefs(lease.proposedRefs);
  const changed = changedRefs(current.refs, lease.proposedRefs);
  if (changed.length > STORAGE_LIMITS.refsPerPush)
    throw new StorageError('too_many_ref_updates', 'A push may update at most 32 refs.');
  if (Object.keys(expectedRefs).length > STORAGE_LIMITS.refsPerPush)
    throw new StorageError('too_many_ref_updates', 'A push may compare at most 32 refs.');
  for (const name of changed) {
    if (!Object.hasOwn(expectedRefs, name))
      throw new StorageError('expected_ref_missing', `Push is missing the expected value for ${name}.`);
  }
  for (const [name, expected] of Object.entries(expectedRefs)) {
    if (!safeRef(name) || (expected !== null && !gitHash(expected)))
      throw new StorageError('invalid_ref', 'The push contains an invalid expected Git ref.');
    if ((current.refs[name] ?? null) !== expected)
      throw new StorageError('ref_changed', `Ref ${name} changed before the push began.`);
  }
  return { ...current, activePush: { ...lease, expectedGeneration: current.generation } };
}

export function proposePushRefs(
  state: RepositoryState,
  pushId: string,
  refs: Record<string, GitHash>,
  now: number
): RepositoryState {
  const current = expirePush(state, now);
  if (!current.activePush || current.activePush.id !== pushId)
    throw new StorageError('push_lease_lost', 'The repository push lease is no longer valid.');
  validateRefs(refs);
  if (changedRefCount(current.refs, refs) > STORAGE_LIMITS.refsPerPush)
    throw new StorageError('too_many_ref_updates', 'A push may update at most 32 refs.');
  return { ...current, activePush: { ...current.activePush, proposedRefs: refs } };
}

export function abortPush(state: RepositoryState, pushId: string): RepositoryState {
  return state.activePush?.id === pushId ? { ...state, activePush: null } : state;
}

export function publish(state: RepositoryState, publication: Publication, now: number): RepositoryState {
  const current = expirePush(state, now);
  if (!current.activePush || current.activePush.id !== publication.pushId)
    throw new StorageError('push_lease_lost', 'The repository push lease is no longer valid.');
  if (
    current.generation !== publication.expectedGeneration ||
    current.activePush.expectedGeneration !== publication.expectedGeneration
  )
    throw new StorageError('generation_changed', 'Repository storage changed while the push was being prepared.');
  if (!refsEqual(current.activePush.proposedRefs, publication.refs))
    throw new StorageError('refs_changed', 'Published refs differ from the validated push proposal.');
  validateRefs(publication.refs);
  validatePacks(publication.packs);
  const storedBytes = publication.packs.reduce((total, pack) => total + pack.compressedBytes, 0);
  if (storedBytes > STORAGE_LIMITS.repositoryBytes)
    throw new StorageError('repository_too_large', 'The repository exceeds its storage limit.');
  return {
    generation: current.generation + 1,
    refsVersion: refsEqual(current.refs, publication.refs) ? current.refsVersion : current.refsVersion + 1,
    refs: publication.refs,
    manifestKey: publication.manifestKey,
    manifestHash: publication.manifestHash,
    packs: publication.packs,
    storedBytes,
    activePush: null
  };
}

function validateRefs(refs: Record<string, GitHash>) {
  const entries = Object.entries(refs);
  if (entries.length > STORAGE_LIMITS.refsPerRepository)
    throw new StorageError('too_many_refs', 'The repository contains too many refs.');
  for (const [name, objectId] of entries) {
    if (!safeRef(name) || !gitHash(objectId))
      throw new StorageError('invalid_ref', 'The push contains an invalid Git ref or object identifier.');
  }
}

export function changesMarlManagedRefs(current: Record<string, GitHash>, proposed: Record<string, GitHash>) {
  return changedRefs(current, proposed).some((name) => name.startsWith('refs/marl/'));
}

export function validatePacks(packs: PackDescriptor[]) {
  if (packs.length > STORAGE_LIMITS.packsPerGeneration)
    throw new StorageError('too_many_packs', 'This repository needs compaction before another pack can be published.');
  const ids = new Set<string>();
  for (const pack of packs) {
    if (!/^[0-9a-f]{40,64}$/.test(pack.id) || ids.has(pack.id))
      throw new StorageError('invalid_pack', 'The pack manifest contains an invalid or duplicate pack.');
    ids.add(pack.id);
    if (
      ![pack.compressedBytes, pack.expandedBytes, pack.objectCount, pack.largestBlobBytes].every(Number.isSafeInteger)
    )
      throw new StorageError('invalid_pack', 'The pack manifest contains invalid measurements.');
    if (pack.compressedBytes < 0 || pack.expandedBytes < 0 || pack.objectCount < 0 || pack.largestBlobBytes < 0)
      throw new StorageError('invalid_pack', 'Pack measurements cannot be negative.');
  }
}

export class StorageError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

function expirePush(state: RepositoryState, now: number): RepositoryState {
  return state.activePush && state.activePush.expiresAt <= now ? { ...state, activePush: null } : state;
}

function refsEqual(left: Record<string, string>, right: Record<string, string>) {
  const leftEntries = Object.entries(left);
  return leftEntries.length === Object.keys(right).length && leftEntries.every(([key, value]) => right[key] === value);
}

function changedRefs(left: Record<string, string>, right: Record<string, string>) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((name) => left[name] !== right[name]);
}

function changedRefCount(left: Record<string, string>, right: Record<string, string>) {
  return changedRefs(left, right).length;
}

function gitHash(value: string) {
  return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(value);
}

function safeRef(value: string) {
  const forbidden = new Set(['~', '^', ':', '?', '*', '[', '\\']);
  const components = value.split('/');
  return (
    value.startsWith('refs/') &&
    components.slice(1).every((part) => part && !part.startsWith('.') && !part.endsWith('.lock')) &&
    !value.endsWith('/') &&
    !value.endsWith('.') &&
    !value.includes('..') &&
    !value.includes('@{') &&
    !value.includes('//') &&
    ![...value].some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || forbidden.has(character)
    )
  );
}
