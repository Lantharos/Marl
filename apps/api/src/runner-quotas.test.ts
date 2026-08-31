import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { reserveArtifactUploadSql, reserveEmptyArtifactSql, reserveLogChunkSql, runnerQuotas } from './runner-quotas';

describe('runner aggregate quota reservations', () => {
  test('serializes log reservations at the exact per-job boundary', () => {
    const database = quotaDatabase();
    database.run('INSERT INTO job_log_chunks VALUES (?,?,?,?,?)', ['log_existing', 'job_one', 0, 'logs/existing', runnerQuotas.logBytesPerJob - 1]);

    expect(reserveLog(database, 'log_boundary', 'job_one', 1, 1).changes).toBe(1);
    expect(reserveLog(database, 'log_overflow', 'job_one', 2, 1).changes).toBe(0);
    expect(reserveLog(database, 'log_duplicate', 'job_one', 1, 1).changes).toBe(0);
    expect(database.query('SELECT SUM(byte_size) AS bytes FROM job_log_chunks WHERE job_id=?').get('job_one')).toEqual({ bytes: runnerQuotas.logBytesPerJob });
  });

  test('bounds tiny log chunks independently of their byte total', () => {
    const database = quotaDatabase();
    database.run('INSERT INTO job_log_chunks VALUES (?,?,?,?,?)', ['log_existing', 'job_one', 0, 'logs/existing', 1]);
    expect(reserveLog(database, 'log_blocked', 'job_one', 1, 1, 1).changes).toBe(0);
  });

  test('counts completed and in-flight artifacts in one atomic reservation', () => {
    const database = quotaDatabase();
    database.run('INSERT INTO artifacts VALUES (?,?,?,?,?,?)', ['artifact_existing', 'job_one', 'existing', 'artifacts/existing', runnerQuotas.artifactBytesPerJob - 20, 'application/octet-stream']);
    database.run("INSERT INTO artifact_uploads VALUES (?,?,?,?,?,?,?,'uploading',datetime('now','+1 hour'))", ['upload_active', 'job_one', 'active', 'artifacts/active', 'multipart_active', 5, 'application/octet-stream']);
    database.run("INSERT INTO artifact_uploads VALUES (?,?,?,?,?,?,?,'uploading',datetime('now','-1 hour'))", ['upload_expired', 'job_one', 'expired', 'artifacts/expired', 'multipart_expired', runnerQuotas.artifactBytesPerJob, 'application/octet-stream']);

    expect(reserveArtifact(database, 'upload_boundary', 'job_one', 'boundary', 15).changes).toBe(1);
    expect(reserveArtifact(database, 'upload_overflow', 'job_one', 'overflow', 1).changes).toBe(0);
    expect(reserveArtifact(database, 'upload_duplicate', 'job_one', 'boundary', 15).changes).toBe(0);
  });

  test('prevents active and completed artifacts from claiming the same name', () => {
    const database = quotaDatabase();
    database.run("INSERT INTO artifact_uploads VALUES (?,?,?,?,?,?,?,'uploading',datetime('now','+1 hour'))", ['upload_active', 'job_one', 'shared', 'artifacts/shared', 'multipart_shared', 1, 'application/octet-stream']);
    expect(reserveEmptyArtifact(database, 'artifact_shared', 'job_one', 'shared').changes).toBe(0);

    database.run('INSERT INTO artifacts VALUES (?,?,?,?,?,?)', ['artifact_done', 'job_one', 'done', 'artifacts/done', 0, 'application/octet-stream']);
    expect(reserveArtifact(database, 'upload_done', 'job_one', 'done', 1).changes).toBe(0);
  });

  test('bounds artifact object counts independently of their byte total', () => {
    const database = quotaDatabase();
    database.run('INSERT INTO artifacts VALUES (?,?,?,?,?,?)', ['artifact_existing', 'job_one', 'existing', 'artifacts/existing', 0, 'application/octet-stream']);
    expect(reserveEmptyArtifact(database, 'artifact_blocked', 'job_one', 'blocked', 1).changes).toBe(0);
    expect(reserveArtifact(database, 'upload_blocked', 'job_one', 'upload', 1, 1).changes).toBe(0);
  });
});

function quotaDatabase() {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE job_log_chunks (id TEXT PRIMARY KEY,job_id TEXT NOT NULL,sequence INTEGER NOT NULL,object_key TEXT NOT NULL,byte_size INTEGER NOT NULL,UNIQUE(job_id,sequence));
    CREATE TABLE artifacts (id TEXT PRIMARY KEY,job_id TEXT NOT NULL,name TEXT NOT NULL,object_key TEXT NOT NULL,byte_size INTEGER NOT NULL,content_type TEXT NOT NULL,UNIQUE(job_id,name));
    CREATE TABLE artifact_uploads (id TEXT PRIMARY KEY,job_id TEXT NOT NULL,name TEXT NOT NULL,object_key TEXT NOT NULL,multipart_upload_id TEXT NOT NULL,expected_size INTEGER NOT NULL,content_type TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'uploading',expires_at TEXT NOT NULL,UNIQUE(job_id,name));
  `);
  return database;
}

function reserveLog(database: Database, id: string, jobId: string, sequence: number, bytes: number, countLimit = runnerQuotas.logChunksPerJob) {
  return database.run(reserveLogChunkSql, [id, jobId, sequence, `logs/${id}`, bytes, bytes, runnerQuotas.logBytesPerJob, jobId, jobId, countLimit]);
}

function reserveArtifact(database: Database, id: string, jobId: string, name: string, bytes: number, countLimit = runnerQuotas.artifactsPerJob) {
  return database.run(reserveArtifactUploadSql, [id, jobId, name, `artifacts/${id}`, `multipart_${id}`, bytes, 'application/octet-stream', jobId, name, bytes, runnerQuotas.artifactBytesPerJob, jobId, jobId, jobId, jobId, countLimit]);
}

function reserveEmptyArtifact(database: Database, id: string, jobId: string, name: string, countLimit = runnerQuotas.artifactsPerJob) {
  return database.run(reserveEmptyArtifactSql, [id, jobId, name, `artifacts/${id}`, 0, 'application/octet-stream', jobId, name, jobId, jobId, countLimit]);
}
