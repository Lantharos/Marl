import { STORAGE_LIMITS, StorageError, type OrganizationQuotaState, type StorageReservation } from './storage-model';

type ReservationRow = { id: string; repository: string; maximumBytes: number; expiresAt: number; state: 'reserved' | 'committed'; actualBytes: number | null };

export class OrganizationQuotaStore {
  private sql: SqlStorage;

  constructor(private storage: DurableObjectStorage) {
    this.sql = storage.sql;
    this.sql.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS quota_meta (id INTEGER PRIMARY KEY CHECK(id=1),used_bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS quota_reservations (id TEXT PRIMARY KEY,repository TEXT NOT NULL,maximum_bytes INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('reserved','committed')),actual_bytes INTEGER);
      CREATE INDEX IF NOT EXISTS quota_reservations_by_state_expiry ON quota_reservations(state,expires_at);
      CREATE TABLE IF NOT EXISTS quota_adjustments (id TEXT PRIMARY KEY,delta_bytes INTEGER NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS quota_adjustments_by_created ON quota_adjustments(created_at);
      INSERT OR IGNORE INTO quota_meta VALUES (1,0);
    `);
  }

  snapshot(now: number): OrganizationQuotaState {
    this.expire(now);
    const usedBytes = this.usedBytes();
    const reservations = Object.fromEntries(this.sql.exec<ReservationRow>('SELECT id,repository,maximum_bytes AS maximumBytes,expires_at AS expiresAt,state,actual_bytes AS actualBytes FROM quota_reservations').toArray().map((row) => [row.id, reservation(row)]));
    const adjustments = Object.fromEntries(this.sql.exec<{ id: string; deltaBytes: number }>('SELECT id,delta_bytes AS deltaBytes FROM quota_adjustments').toArray().map((row) => [row.id, row.deltaBytes]));
    return { usedBytes, reservations, adjustments };
  }

  reserve(value: StorageReservation, now: number) {
    this.expire(now);
    if (!Number.isSafeInteger(value.maximumBytes) || value.maximumBytes < 0 || value.maximumBytes > STORAGE_LIMITS.pushBytes) throw new StorageError('invalid_reservation', 'The requested upload reservation is invalid.');
    const existing = this.reservation(value.id);
    if (existing) {
      if (existing.repository !== value.repository || existing.maximumBytes !== value.maximumBytes) throw new StorageError('reservation_conflict', 'The reservation identifier is already in use.');
      return existing;
    }
    const active = this.sql.exec<{ count: number; bytes: number }>("SELECT COUNT(*) AS count,COALESCE(SUM(maximum_bytes),0) AS bytes FROM quota_reservations WHERE state='reserved'").one();
    if (active.count >= STORAGE_LIMITS.activeUploadsPerOrganization) throw new StorageError('organization_upload_limit', 'This organization already has the maximum number of active uploads.');
    if (this.usedBytes() + active.bytes + value.maximumBytes > STORAGE_LIMITS.organizationBytes) throw new StorageError('organization_storage_limit', 'This upload would exceed the organization storage limit.');
    this.sql.exec('INSERT INTO quota_reservations (id,repository,maximum_bytes,expires_at,state) VALUES (?,?,?,?,?)', value.id, value.repository, value.maximumBytes, value.expiresAt, 'reserved');
    return value;
  }

  settle(id: string, actualBytes: number, now: number) {
    this.expire(now, id);
    const existing = this.reservation(id);
    if (!existing) throw new StorageError('reservation_missing', 'The storage reservation does not exist.');
    if (!Number.isSafeInteger(actualBytes) || actualBytes < 0 || actualBytes > existing.maximumBytes) throw new StorageError('reservation_exceeded', 'Published bytes exceed the storage reservation.');
    if (existing.state === 'committed') {
      if (existing.actualBytes !== actualBytes) throw new StorageError('settlement_conflict', 'The storage reservation was already settled with a different size.');
      return;
    }
    this.storage.transactionSync(() => {
      this.sql.exec('UPDATE quota_meta SET used_bytes=used_bytes+? WHERE id=1', actualBytes);
      this.sql.exec("UPDATE quota_reservations SET state='committed',actual_bytes=? WHERE id=?", actualBytes, id);
    });
  }

  release(id: string, now: number) {
    this.expire(now);
    this.sql.exec("DELETE FROM quota_reservations WHERE id=? AND state='reserved'", id);
  }

  adjust(id: string, deltaBytes: number, now: number) {
    if (!id || !Number.isSafeInteger(deltaBytes)) throw new StorageError('invalid_adjustment', 'The storage adjustment is invalid.');
    const existing = this.sql.exec<{ deltaBytes: number }>('SELECT delta_bytes AS deltaBytes FROM quota_adjustments WHERE id=?', id).toArray()[0];
    if (existing) {
      if (existing.deltaBytes !== deltaBytes) throw new StorageError('adjustment_conflict', 'The storage adjustment was already recorded with a different size.');
      return;
    }
    const usedBytes = this.usedBytes() + deltaBytes;
    if (usedBytes < 0 || usedBytes > STORAGE_LIMITS.organizationBytes) throw new StorageError('organization_storage_limit', 'The storage adjustment exceeds the organization limit.');
    this.storage.transactionSync(() => {
      this.sql.exec('UPDATE quota_meta SET used_bytes=? WHERE id=1', usedBytes);
      this.sql.exec('INSERT INTO quota_adjustments (id,delta_bytes,created_at) VALUES (?,?,?)', id, deltaBytes, now);
      this.sql.exec('DELETE FROM quota_adjustments WHERE created_at<?', now - 30 * 24 * 60 * 60 * 1000);
    });
  }

  private expire(now: number, keepId?: string) {
    this.sql.exec("DELETE FROM quota_reservations WHERE id!=? AND ((state='reserved' AND expires_at<=?) OR (state='committed' AND expires_at+86400000<=?))", keepId ?? '', now, now);
  }

  private usedBytes() {
    return this.sql.exec<{ usedBytes: number }>('SELECT used_bytes AS usedBytes FROM quota_meta WHERE id=1').one().usedBytes;
  }

  private reservation(id: string) {
    const row = this.sql.exec<ReservationRow>('SELECT id,repository,maximum_bytes AS maximumBytes,expires_at AS expiresAt,state,actual_bytes AS actualBytes FROM quota_reservations WHERE id=?', id).toArray()[0];
    return row ? reservation(row) : null;
  }
}

function reservation(row: ReservationRow): StorageReservation {
  return { id: row.id, repository: row.repository, maximumBytes: row.maximumBytes, expiresAt: row.expiresAt, state: row.state, ...(row.actualBytes === null ? {} : { actualBytes: row.actualBytes }) };
}
