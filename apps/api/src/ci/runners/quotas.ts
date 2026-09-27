export const runnerQuotas = {
  logChunkBytes: 1024 * 1024,
  logBytesPerJob: 64 * 1024 * 1024,
  logChunksPerJob: 65_536,
  artifactBytesPerJob: 2 * 1024 * 1024 * 1024,
  artifactsPerJob: 4_096
} as const;

export const reserveLogChunkSql = `
  INSERT INTO job_log_chunks (id,job_id,sequence,object_key,byte_size)
  SELECT ?,?,?,?,?
  WHERE ? <= ? - COALESCE((SELECT SUM(byte_size) FROM job_log_chunks WHERE job_id=?),0)
    AND (SELECT COUNT(*) FROM job_log_chunks WHERE job_id=?) < ?
  ON CONFLICT(job_id,sequence) DO NOTHING
`;

export const reserveArtifactUploadSql = `
  INSERT INTO artifact_uploads (id,job_id,name,object_key,multipart_upload_id,expected_size,content_type,expires_at)
  SELECT ?,?,?,?,?,?,?,datetime('now','+1 hour')
  WHERE NOT EXISTS (SELECT 1 FROM artifacts WHERE job_id=? AND name=?)
    AND ? <= ?
      - COALESCE((SELECT SUM(byte_size) FROM artifacts WHERE job_id=?),0)
      - COALESCE((SELECT SUM(expected_size) FROM artifact_uploads WHERE job_id=? AND state='uploading' AND expires_at>CURRENT_TIMESTAMP),0)
    AND (SELECT COUNT(*) FROM artifacts WHERE job_id=?)
      + (SELECT COUNT(*) FROM artifact_uploads WHERE job_id=? AND state='uploading' AND expires_at>CURRENT_TIMESTAMP) < ?
  ON CONFLICT(job_id,name) DO NOTHING
`;

export const reserveEmptyArtifactSql = `
  INSERT INTO artifacts (id,job_id,name,object_key,byte_size,content_type)
  SELECT ?,?,?,?,?,?
  WHERE NOT EXISTS (
    SELECT 1 FROM artifact_uploads
    WHERE job_id=? AND name=? AND state='uploading' AND expires_at>CURRENT_TIMESTAMP
  )
    AND (SELECT COUNT(*) FROM artifacts WHERE job_id=?)
      + (SELECT COUNT(*) FROM artifact_uploads WHERE job_id=? AND state='uploading' AND expires_at>CURRENT_TIMESTAMP) < ?
  ON CONFLICT(job_id,name) DO NOTHING
`;
