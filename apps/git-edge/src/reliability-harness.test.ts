import { describe, expect, test } from 'bun:test';
import { publishWithReconciliation, type CommittedPush } from './reconciliation';
import {
  adjustStorage,
  beginPush,
  emptyOrganizationQuota,
  emptyRepositoryState,
  publish,
  releaseReservation,
  reserveStorage,
  settleStorage,
  type OrganizationQuotaState,
  type PackDescriptor,
  type RepositoryState
} from './storage-model';

const now = 1_000_000;
const main = 'a'.repeat(40);
const next = 'b'.repeat(40);
const pack: PackDescriptor = {
  id: 'c'.repeat(40),
  packKey: 'repositories/repo/packs/c.pack',
  indexKey: 'repositories/repo/packs/c.idx',
  objectIndexKey: 'repositories/repo/packs/c.objects.json',
  compressedBytes: 700,
  expandedBytes: 900,
  objectCount: 12,
  largestBlobBytes: 200
};

type Checkpoint = 'canonical-pack' | 'canonical-index' | 'canonical-object-index' | 'manifest' | 'published' | 'settled' | 'acknowledged';

class Crash extends Error {}

class PublicationHarness {
  repository: RepositoryState = { ...emptyRepositoryState(), refs: { 'refs/heads/main': main } };
  quota: OrganizationQuotaState = emptyOrganizationQuota();
  objects = new Set<string>();
  committed: CommittedPush | null = null;
  acknowledged = false;

  constructor(private crashAt?: Checkpoint) {}

  async run() {
    const pushId = 'push_fault_test';
    const refs = { 'refs/heads/main': next };
    this.quota = reserveStorage(this.quota, { id: pushId, repository: 'repo', maximumBytes: 1_024, expiresAt: now + 60_000, state: 'reserved' }, now);
    this.repository = beginPush(this.repository, { id: pushId, reservationId: pushId, expiresAt: now + 60_000, proposedRefs: refs }, { 'refs/heads/main': main }, now);
    this.store(pack.packKey, 'canonical-pack');
    this.store(pack.indexKey, 'canonical-index');
    this.store(pack.objectIndexKey, 'canonical-object-index');
    const manifestKey = 'repositories/repo/manifests/1.json';
    this.store(manifestKey, 'manifest');

    const resolution = await publishWithReconciliation({
      publish: async () => {
        this.repository = publish(this.repository, { pushId, expectedGeneration: 0, refs, manifestKey, manifestHash: 'd'.repeat(64), packs: [pack] }, now);
        this.committed = { generation: 1, actualBytes: 700, accountingDelta: 700, manifestKey, manifestHash: 'd'.repeat(64), committedAt: now };
        this.fail('published');
        return this.repository;
      },
      readCommitted: async () => this.committed,
      recover: async () => this.repository,
      discard: async () => this.discard()
    });

    this.quota = settleStorage(this.quota, pushId, resolution.recovered?.actualBytes ?? 700, now);
    this.fail('settled');
    this.acknowledged = true;
    this.committed = null;
    this.fail('acknowledged');
  }

  reconcile() {
    if (!this.committed) {
      if (this.repository.generation === 0) this.discard();
      return;
    }
    this.quota = settleStorage(this.quota, 'push_fault_test', this.committed.actualBytes, now);
    this.acknowledged = true;
    this.committed = null;
  }

  private store(key: string, checkpoint: Checkpoint) {
    this.objects.add(key);
    this.fail(checkpoint);
  }

  private fail(checkpoint: Checkpoint) {
    if (this.crashAt === checkpoint) throw new Crash(checkpoint);
  }

  private discard() {
    this.objects.clear();
    this.repository = { ...this.repository, activePush: null };
    this.quota = releaseReservation(this.quota, 'push_fault_test', now);
  }
}

describe('publication failure harness', () => {
  test('every crash before publication remains safely discardable', async () => {
    for (const checkpoint of ['canonical-pack', 'canonical-index', 'canonical-object-index', 'manifest'] satisfies Checkpoint[]) {
      const harness = new PublicationHarness(checkpoint);
      await expect(harness.run()).rejects.toBeInstanceOf(Crash);
      harness.reconcile();
      expect(harness.repository.generation).toBe(0);
      expect(harness.objects.size).toBe(0);
      expect(harness.quota.usedBytes).toBe(0);
      expect(harness.acknowledged).toBeFalse();
    }
  });

  test('a lost publication response recovers the committed generation', async () => {
    const harness = new PublicationHarness('published');
    await harness.run();
    expect(harness.repository.generation).toBe(1);
    expect(harness.repository.refs['refs/heads/main']).toBe(next);
    expect(harness.quota.usedBytes).toBe(700);
    expect(harness.acknowledged).toBeTrue();
    expect(harness.objects).toEqual(new Set([pack.packKey, pack.indexKey, pack.objectIndexKey, 'repositories/repo/manifests/1.json']));
  });

  test('settlement and acknowledgement crashes converge idempotently', async () => {
    for (const checkpoint of ['settled', 'acknowledged'] satisfies Checkpoint[]) {
      const harness = new PublicationHarness(checkpoint);
      await expect(harness.run()).rejects.toBeInstanceOf(Crash);
      harness.reconcile();
      harness.reconcile();
      expect(harness.repository.generation).toBe(1);
      expect(harness.quota.usedBytes).toBe(700);
      expect(harness.acknowledged).toBeTrue();
    }
  });

  test('compaction replacement accounts only for its storage delta', () => {
    const compacted = { ...pack, id: 'e'.repeat(40), packKey: 'repositories/repo/packs/e.pack', indexKey: 'repositories/repo/packs/e.idx', objectIndexKey: 'repositories/repo/packs/e.objects.json', compressedBytes: 500 };
    let repository = { ...emptyRepositoryState(), generation: 1, refsVersion: 1, refs: { 'refs/heads/main': next }, manifestKey: 'manifest-1', manifestHash: 'f'.repeat(64), packs: [pack], storedBytes: 700 };
    repository = beginPush(repository, { id: 'compact_1', reservationId: 'compact_1', expiresAt: now + 60_000, proposedRefs: repository.refs }, {}, now);
    repository = publish(repository, { pushId: 'compact_1', expectedGeneration: 1, refs: repository.refs, manifestKey: 'manifest-2', manifestHash: '1'.repeat(64), packs: [compacted] }, now);
    let quota = { ...emptyOrganizationQuota(), usedBytes: 700 };
    quota = adjustStorage(quota, 'compact_1', repository.storedBytes - 700);
    quota = adjustStorage(quota, 'compact_1', repository.storedBytes - 700);
    expect(repository.generation).toBe(2);
    expect(repository.refs['refs/heads/main']).toBe(next);
    expect(quota.usedBytes).toBe(500);
  });
});
