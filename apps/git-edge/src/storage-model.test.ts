import { describe, expect, test } from 'bun:test';
import { STORAGE_LIMITS, StorageError, adjustStorage, beginPush, emptyOrganizationQuota, emptyRepositoryState, proposePushRefs, publish, releaseReservation, reserveStorage, settleStorage } from './storage-model';

const now = 1_000_000;
const reservation = { id: 'push_1', repository: 'lantharos/sty', maximumBytes: 1024, expiresAt: now + 60_000, state: 'reserved' as const };
const pack = { id: 'a'.repeat(40), packKey: 'repositories/lantharos/sty/packs/a.pack', indexKey: 'repositories/lantharos/sty/packs/a.idx', compressedBytes: 700, expandedBytes: 900, objectCount: 12, largestBlobBytes: 200 };

describe('repository publication', () => {
  test('publishes an immutable generation under the matching lease', () => {
    const leased = beginPush(emptyRepositoryState(), { id: 'push_1', reservationId: 'push_1', expiresAt: now + 60_000, proposedRefs: { 'refs/heads/main': 'b'.repeat(40) } }, { 'refs/heads/main': null }, now);
    const next = publish(leased, { pushId: 'push_1', expectedGeneration: 0, refs: { 'refs/heads/main': 'b'.repeat(40) }, manifestKey: 'manifest-1.json', manifestHash: 'c'.repeat(64), packs: [pack] }, now);
    expect(next.generation).toBe(1);
    expect(next.refsVersion).toBe(1);
    expect(next.activePush).toBeNull();
    expect(next.storedBytes).toBe(700);
  });

  test('rejects stale or expired publication', () => {
    const leased = beginPush(emptyRepositoryState(), { id: 'push_1', reservationId: 'push_1', expiresAt: now + 10, proposedRefs: {} }, {}, now);
    expect(() => publish(leased, { pushId: 'push_1', expectedGeneration: 0, refs: {}, manifestKey: 'manifest', manifestHash: 'c'.repeat(64), packs: [] }, now + 11)).toThrow(StorageError);
  });
});

describe('repository ref limits', () => {
  test('limits changed refs without limiting the total ref set', () => {
    const refs = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`refs/heads/branch-${index}`, 'a'.repeat(40)]));
    const state = { ...emptyRepositoryState(), refs };
    const leased = beginPush(state, { id: 'push_one', reservationId: 'reserve_one', expiresAt: now + 1_000, proposedRefs: refs }, {}, now);
    const proposed = { ...refs, 'refs/heads/branch-0': 'b'.repeat(40) };
    expect(proposePushRefs(leased, 'push_one', proposed, now).activePush?.proposedRefs).toEqual(proposed);
    const excessive = { ...refs, ...Object.fromEntries(Array.from({ length: STORAGE_LIMITS.refsPerPush + 1 }, (_, index) => [`refs/tags/new-${index}`, 'b'.repeat(40)])) };
    expect(() => proposePushRefs(leased, 'push_one', excessive, now)).toThrow(StorageError);
  });
});

describe('organization reservations', () => {
  test('reserves, settles, and makes settlement idempotent', () => {
    const reserved = reserveStorage(emptyOrganizationQuota(), reservation, now);
    const settled = settleStorage(reserved, reservation.id, 700, now);
    expect(settled.usedBytes).toBe(700);
    expect(settleStorage(settled, reservation.id, 700, now)).toEqual(settled);
  });

  test('releases unfinished reservations and enforces the push ceiling', () => {
    const reserved = reserveStorage(emptyOrganizationQuota(), reservation, now);
    expect(releaseReservation(reserved, reservation.id, now).reservations).toEqual({});
    expect(() => reserveStorage(emptyOrganizationQuota(), { ...reservation, maximumBytes: STORAGE_LIMITS.pushBytes + 1 }, now)).toThrow(StorageError);
  });

  test('applies idempotent compaction adjustments', () => {
    const state = { ...emptyOrganizationQuota(), usedBytes: 1_000 };
    const adjusted = adjustStorage(state, 'compact_1', -200);
    expect(adjusted.usedBytes).toBe(800);
    expect(adjustStorage(adjusted, 'compact_1', -200)).toEqual(adjusted);
  });
});
