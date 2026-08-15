import { describe, expect, test } from 'bun:test';
import { publicationFailureDisposition, publishWithReconciliation, type CommittedPush } from './reconciliation';
import { StateRequestError } from './state-client';

const committed: CommittedPush = {
  generation: 4,
  actualBytes: 700,
  accountingDelta: 700,
  manifestKey: 'repositories/lantharos/sty/manifests/4.json',
  manifestHash: 'a'.repeat(64),
  committedAt: 1_000
};

describe('ambiguous repository publication', () => {
  test('treats a durable commit record as authoritative', () => {
    expect(publicationFailureDisposition(new Error('connection reset'), committed)).toBe('published');
  });

  test('discards objects only after a definitive state rejection', () => {
    expect(publicationFailureDisposition(new StateRequestError(409, 'generation_changed', 'Generation changed.'), null)).toBe('discard');
  });

  test('defers cleanup when the publication outcome is unknown', () => {
    expect(publicationFailureDisposition(new Error('connection reset'), null)).toBe('defer');
  });

  test('recovers a commit whose response was lost without deleting its objects', async () => {
    let discarded = false;
    const resolution = await publishWithReconciliation({
      publish: async () => { throw new Error('connection reset'); },
      readCommitted: async () => committed,
      recover: async (record) => `generation-${record.generation}`,
      discard: async () => { discarded = true; }
    });
    expect(resolution).toEqual({ value: 'generation-4', recovered: committed });
    expect(discarded).toBeFalse();
  });

  test('deletes quarantine only after an explicit state rejection', async () => {
    let discarded = false;
    const rejection = new StateRequestError(409, 'generation_changed', 'Generation changed.');
    await expect(publishWithReconciliation({
      publish: async () => { throw rejection; },
      readCommitted: async () => null,
      recover: async () => 'unreachable',
      discard: async () => { discarded = true; }
    })).rejects.toBe(rejection);
    expect(discarded).toBeTrue();
  });

  test('preserves quarantine when both publication and reconciliation are uncertain', async () => {
    let discarded = false;
    await expect(publishWithReconciliation({
      publish: async () => { throw new Error('connection reset'); },
      readCommitted: async () => null,
      recover: async () => 'unreachable',
      discard: async () => { discarded = true; }
    })).rejects.toThrow('connection reset');
    expect(discarded).toBeFalse();
  });

  test('preserves quarantine if the reconciliation read also fails', async () => {
    let discarded = false;
    await expect(publishWithReconciliation({
      publish: async () => { throw new Error('connection reset'); },
      readCommitted: async () => { throw new Error('state unavailable'); },
      recover: async () => 'unreachable',
      discard: async () => { discarded = true; }
    })).rejects.toThrow('state unavailable');
    expect(discarded).toBeFalse();
  });
});
