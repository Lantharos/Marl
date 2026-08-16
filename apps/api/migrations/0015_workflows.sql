CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('sty', 'github')),
  triggers_json TEXT NOT NULL,
  jobs_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('valid', 'invalid')),
  error TEXT,
  commit_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repository_id, branch, path)
);

CREATE INDEX workflows_by_repository ON workflows(repository_id, branch, active, name);

ALTER TABLE runs ADD COLUMN workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL;

CREATE INDEX runs_by_workflow ON runs(workflow_id, created_at DESC);
