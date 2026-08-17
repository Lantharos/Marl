PRAGMA foreign_keys = ON;

CREATE TABLE artifact_uploads (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  multipart_upload_id TEXT NOT NULL,
  expected_size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'uploading' CHECK (state IN ('uploading', 'completed')),
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (job_id, name)
);

CREATE TABLE artifact_upload_parts (
  upload_id TEXT NOT NULL REFERENCES artifact_uploads(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  PRIMARY KEY (upload_id, part_number)
);

CREATE INDEX artifact_uploads_by_expiry ON artifact_uploads(state, expires_at);

CREATE INDEX jobs_by_lease_expiry ON jobs(state, lease_expires_at) WHERE state = 'running';
