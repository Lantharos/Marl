import type { PackDescriptor, RepositoryState } from './storage-model';

type MetaRow = {
  generation: number;
  refsVersion: number;
  manifestKey: string | null;
  manifestHash: string | null;
  storedBytes: number;
  pushId: string | null;
  reservationId: string | null;
  expectedGeneration: number | null;
  expiresAt: number | null;
};

type RefRow = { name: string; objectId: string };
type PackRow = PackDescriptor;
export type ObjectLocator = { id: string; packId: string; packKey: string; kind: string; size: number; packedBytes: number; offset: number };
export type CatalogObject = Omit<ObjectLocator, 'packId' | 'packKey'>;

export class RepositoryStateStore {
  private sql: SqlStorage;

  constructor(private storage: DurableObjectStorage) {
    this.sql = storage.sql;
    this.initialize();
  }

  read(): RepositoryState {
    const meta = this.sql.exec<MetaRow>('SELECT generation,refs_version AS refsVersion,manifest_key AS manifestKey,manifest_hash AS manifestHash,stored_bytes AS storedBytes,push_id AS pushId,reservation_id AS reservationId,expected_generation AS expectedGeneration,expires_at AS expiresAt FROM repository_meta WHERE id=1').one();
    const refs = Object.fromEntries(this.sql.exec<RefRow>('SELECT name,object_id AS objectId FROM repository_refs').toArray().map((row) => [row.name, row.objectId]));
    const packs = this.sql.exec<PackRow>('SELECT id,pack_key AS packKey,index_key AS indexKey,object_index_key AS objectIndexKey,compressed_bytes AS compressedBytes,expanded_bytes AS expandedBytes,object_count AS objectCount,largest_blob_bytes AS largestBlobBytes FROM repository_packs ORDER BY ordinal').toArray();
    const proposedRefs = meta.pushId
      ? Object.fromEntries(this.sql.exec<RefRow>('SELECT name,object_id AS objectId FROM proposed_refs').toArray().map((row) => [row.name, row.objectId]))
      : {};
    return {
      generation: meta.generation,
      refsVersion: meta.refsVersion,
      refs,
      manifestKey: meta.manifestKey,
      manifestHash: meta.manifestHash,
      packs,
      storedBytes: meta.storedBytes,
      activePush: meta.pushId && meta.reservationId && meta.expectedGeneration !== null && meta.expiresAt !== null
        ? { id: meta.pushId, reservationId: meta.reservationId, expectedGeneration: meta.expectedGeneration, expiresAt: meta.expiresAt, proposedRefs }
        : null
    };
  }

  write(previous: RepositoryState, next: RepositoryState) {
    this.storage.transactionSync(() => {
      this.sql.exec('UPDATE repository_meta SET generation=?,refs_version=?,manifest_key=?,manifest_hash=?,stored_bytes=?,push_id=?,reservation_id=?,expected_generation=?,expires_at=? WHERE id=1', next.generation, next.refsVersion, next.manifestKey, next.manifestHash, next.storedBytes, next.activePush?.id ?? null, next.activePush?.reservationId ?? null, next.activePush?.expectedGeneration ?? null, next.activePush?.expiresAt ?? null);
      syncRefs(this.sql, 'repository_refs', previous.refs, next.refs);
      syncRefs(this.sql, 'proposed_refs', previous.activePush?.proposedRefs ?? {}, next.activePush?.proposedRefs ?? {});
      syncPacks(this.sql, previous.packs, next.packs);
    });
  }

  publish(previous: RepositoryState, next: RepositoryState, pushId: string, removed: PackDescriptor[], now: number) {
    this.storage.transactionSync(() => {
      this.sql.exec('UPDATE repository_meta SET generation=?,refs_version=?,manifest_key=?,manifest_hash=?,stored_bytes=?,push_id=NULL,reservation_id=NULL,expected_generation=NULL,expires_at=NULL WHERE id=1', next.generation, next.refsVersion, next.manifestKey, next.manifestHash, next.storedBytes);
      syncRefs(this.sql, 'repository_refs', previous.refs, next.refs);
      syncRefs(this.sql, 'proposed_refs', previous.activePush?.proposedRefs ?? {}, {});
      syncPacks(this.sql, previous.packs, next.packs);
      this.sql.exec('INSERT OR REPLACE INTO committed_pushes (push_id,generation,actual_bytes,accounting_delta,manifest_key,manifest_hash,committed_at) VALUES (?,?,?,?,?,?,?)', pushId, next.generation, next.packs.filter((pack) => !previous.packs.some((value) => value.id === pack.id)).reduce((total, pack) => total + pack.compressedBytes, 0), next.storedBytes - previous.storedBytes, next.manifestKey, next.manifestHash, now);
      this.sql.exec('INSERT INTO repository_generations (generation,manifest_key,manifest_hash,created_at) VALUES (?,?,?,?)', next.generation, next.manifestKey, next.manifestHash, now);
      this.sql.exec('INSERT OR REPLACE INTO integrity_schedule (id,generation,attempts,next_verify_at) VALUES (1,?,0,?)', next.generation, now);
      if (removed.length) {
        this.sql.exec('INSERT INTO retirements (generation,delete_after,before_generation,attempts) VALUES (?,?,?,0)', next.generation, now + 31 * 24 * 60 * 60 * 1000, next.generation);
        for (const key of removed.flatMap((pack) => [pack.packKey, pack.indexKey, pack.objectIndexKey])) this.sql.exec('INSERT INTO retirement_keys (generation,object_key) VALUES (?,?)', next.generation, key);
      }
    });
  }

  generation(value: number) {
    return this.sql.exec<{ manifestKey: string; manifestHash: string }>('SELECT manifest_key AS manifestKey,manifest_hash AS manifestHash FROM repository_generations WHERE generation=?', value).toArray()[0] ?? null;
  }

  committed(pushId: string) {
    return this.sql.exec<{ generation: number; actualBytes: number; accountingDelta: number; manifestKey: string; manifestHash: string; committedAt: number }>('SELECT generation,actual_bytes AS actualBytes,accounting_delta AS accountingDelta,manifest_key AS manifestKey,manifest_hash AS manifestHash,committed_at AS committedAt FROM committed_pushes WHERE push_id=?', pushId).toArray()[0] ?? null;
  }

  acknowledge(pushId: string) {
    this.sql.exec('DELETE FROM committed_pushes WHERE push_id=?', pushId);
  }

  integrity() {
    return this.sql.exec<{ generation: number; attempts: number; nextVerifyAt: number }>('SELECT generation,attempts,next_verify_at AS nextVerifyAt FROM integrity_schedule WHERE id=1').toArray()[0] ?? null;
  }

  updateIntegrity(generation: number, attempts: number, nextVerifyAt: number, verifiedAt?: number) {
    this.storage.transactionSync(() => {
      this.sql.exec('UPDATE integrity_schedule SET attempts=?,next_verify_at=? WHERE id=1 AND generation=?', attempts, nextVerifyAt, generation);
      if (verifiedAt !== undefined) this.sql.exec('INSERT OR REPLACE INTO integrity_verification (id,generation,verified_at) VALUES (1,?,?)', generation, verifiedAt);
    });
  }

  retirements() {
    return this.sql.exec<{ generation: number; deleteAfter: number; beforeGeneration: number; attempts: number }>('SELECT generation,delete_after AS deleteAfter,before_generation AS beforeGeneration,attempts FROM retirements ORDER BY delete_after').toArray();
  }

  retirementKeys(generation: number) {
    return this.sql.exec<{ objectKey: string }>('SELECT object_key AS objectKey FROM retirement_keys WHERE generation=?', generation).toArray().map((row) => row.objectKey);
  }

  replaceRetirementKeys(generation: number, keys: string[], attempts: number, deleteAfter: number) {
    this.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM retirement_keys WHERE generation=?', generation);
      for (const key of keys) this.sql.exec('INSERT INTO retirement_keys (generation,object_key) VALUES (?,?)', generation, key);
      this.sql.exec('UPDATE retirements SET attempts=?,delete_after=? WHERE generation=?', attempts, deleteAfter, generation);
    });
  }

  deleteRetirement(generation: number) {
    this.sql.exec('DELETE FROM retirements WHERE generation=?', generation);
  }

  generationsBefore(value: number) {
    return this.sql.exec<{ generation: number; manifestKey: string }>('SELECT generation,manifest_key AS manifestKey FROM repository_generations WHERE generation<?', value).toArray();
  }

  deleteGeneration(generation: number) {
    this.sql.exec('DELETE FROM repository_generations WHERE generation=?', generation);
  }

  catalog(packId: string, objects: CatalogObject[]) {
    this.storage.transactionSync(() => {
      for (const object of objects) this.sql.exec('INSERT INTO repository_objects (id,pack_id,kind,size,packed_bytes,offset) VALUES (?,?,?,?,?,?) ON CONFLICT(id,pack_id) DO UPDATE SET kind=excluded.kind,size=excluded.size,packed_bytes=excluded.packed_bytes,offset=excluded.offset', object.id, packId, object.kind, object.size, object.packedBytes, object.offset);
    });
  }

  catalogCounts() {
    return this.sql.exec<{ packId: string; objectCount: number; catalogCount: number }>('SELECT repository_packs.id AS packId,repository_packs.object_count AS objectCount,COUNT(repository_objects.id) AS catalogCount FROM repository_packs LEFT JOIN repository_objects ON repository_objects.pack_id=repository_packs.id GROUP BY repository_packs.id,repository_packs.object_count').toArray();
  }

  object(id: string) {
    return this.sql.exec<ObjectLocator>('SELECT repository_objects.id,repository_objects.pack_id AS packId,repository_packs.pack_key AS packKey,repository_objects.kind,repository_objects.size,repository_objects.packed_bytes AS packedBytes,repository_objects.offset FROM repository_objects JOIN repository_packs ON repository_packs.id=repository_objects.pack_id WHERE repository_objects.id=? ORDER BY repository_packs.ordinal DESC LIMIT 1', id).toArray()[0] ?? null;
  }

  objectAt(packId: string, offset: number) {
    return this.sql.exec<ObjectLocator>('SELECT repository_objects.id,repository_objects.pack_id AS packId,repository_packs.pack_key AS packKey,repository_objects.kind,repository_objects.size,repository_objects.packed_bytes AS packedBytes,repository_objects.offset FROM repository_objects JOIN repository_packs ON repository_packs.id=repository_objects.pack_id WHERE repository_objects.pack_id=? AND repository_objects.offset=? LIMIT 1', packId, offset).toArray()[0] ?? null;
  }

  private initialize() {
    this.sql.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS repository_meta (id INTEGER PRIMARY KEY CHECK(id=1),generation INTEGER NOT NULL,refs_version INTEGER NOT NULL,manifest_key TEXT,manifest_hash TEXT,stored_bytes INTEGER NOT NULL,push_id TEXT,reservation_id TEXT,expected_generation INTEGER,expires_at INTEGER);
      CREATE TABLE IF NOT EXISTS repository_refs (name TEXT PRIMARY KEY,object_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposed_refs (name TEXT PRIMARY KEY,object_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS repository_packs (id TEXT PRIMARY KEY,ordinal INTEGER NOT NULL,pack_key TEXT NOT NULL,index_key TEXT NOT NULL,object_index_key TEXT NOT NULL,compressed_bytes INTEGER NOT NULL,expanded_bytes INTEGER NOT NULL,object_count INTEGER NOT NULL,largest_blob_bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS repository_objects (id TEXT NOT NULL,pack_id TEXT NOT NULL,kind TEXT NOT NULL,size INTEGER NOT NULL,packed_bytes INTEGER NOT NULL,offset INTEGER NOT NULL,PRIMARY KEY(id,pack_id));
      CREATE INDEX IF NOT EXISTS repository_objects_by_pack_offset ON repository_objects(pack_id,offset);
      CREATE TABLE IF NOT EXISTS committed_pushes (push_id TEXT PRIMARY KEY,generation INTEGER NOT NULL,actual_bytes INTEGER NOT NULL,accounting_delta INTEGER NOT NULL,manifest_key TEXT NOT NULL,manifest_hash TEXT NOT NULL,committed_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS repository_generations (generation INTEGER PRIMARY KEY,manifest_key TEXT NOT NULL,manifest_hash TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS integrity_schedule (id INTEGER PRIMARY KEY CHECK(id=1),generation INTEGER NOT NULL,attempts INTEGER NOT NULL,next_verify_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS integrity_verification (id INTEGER PRIMARY KEY CHECK(id=1),generation INTEGER NOT NULL,verified_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS retirements (generation INTEGER PRIMARY KEY,delete_after INTEGER NOT NULL,before_generation INTEGER NOT NULL,attempts INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS retirement_keys (generation INTEGER NOT NULL REFERENCES retirements(generation) ON DELETE CASCADE,object_key TEXT NOT NULL,PRIMARY KEY(generation,object_key));
      INSERT OR IGNORE INTO repository_meta VALUES (1,0,0,NULL,NULL,0,NULL,NULL,NULL,NULL);
    `);
  }
}

function syncRefs(sql: SqlStorage, table: 'repository_refs' | 'proposed_refs', previous: Record<string, string>, next: Record<string, string>) {
  for (const name of Object.keys(previous)) if (!(name in next)) sql.exec(`DELETE FROM ${table} WHERE name=?`, name);
  for (const [name, objectId] of Object.entries(next)) if (previous[name] !== objectId) sql.exec(`INSERT INTO ${table} (name,object_id) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET object_id=excluded.object_id`, name, objectId);
}

function syncPacks(sql: SqlStorage, previous: PackDescriptor[], next: PackDescriptor[]) {
  const nextIds = new Set(next.map((pack) => pack.id));
  for (const pack of previous) if (!nextIds.has(pack.id)) sql.exec('DELETE FROM repository_packs WHERE id=?', pack.id);
  for (const [ordinal, pack] of next.entries()) sql.exec('INSERT INTO repository_packs (id,ordinal,pack_key,index_key,object_index_key,compressed_bytes,expanded_bytes,object_count,largest_blob_bytes) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ordinal=excluded.ordinal,pack_key=excluded.pack_key,index_key=excluded.index_key,object_index_key=excluded.object_index_key,compressed_bytes=excluded.compressed_bytes,expanded_bytes=excluded.expanded_bytes,object_count=excluded.object_count,largest_blob_bytes=excluded.largest_blob_bytes', pack.id, ordinal, pack.packKey, pack.indexKey, pack.objectIndexKey, pack.compressedBytes, pack.expandedBytes, pack.objectCount, pack.largestBlobBytes);
  sql.exec('DELETE FROM repository_objects WHERE pack_id NOT IN (SELECT id FROM repository_packs)');
}
