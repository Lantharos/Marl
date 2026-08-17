PRAGMA foreign_keys = ON;

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (job_id, name)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  repository_id TEXT,
  actor_id TEXT,
  actor_handle TEXT NOT NULL,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE branch_rules (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  required_approvals INTEGER NOT NULL DEFAULT 0 CHECK (required_approvals BETWEEN 0 AND 10),
  require_checks INTEGER NOT NULL DEFAULT 0 CHECK (require_checks IN (0, 1)),
  require_conversations INTEGER NOT NULL DEFAULT 1 CHECK (require_conversations IN (0, 1)),
  dismiss_stale_reviews INTEGER NOT NULL DEFAULT 1 CHECK (dismiss_stale_reviews IN (0, 1)),
  allowed_merge_methods_json TEXT NOT NULL DEFAULT '["merge","squash","rebase"]',
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, pattern)
);

CREATE TABLE branches (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  commit_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, name),
  FOREIGN KEY (repository_id, commit_id) REFERENCES commits(repository_id, id)
);

CREATE TABLE checks (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_id TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'success', 'failure', 'canceled')),
  summary TEXT NOT NULL DEFAULT '',
  details_url TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (repository_id, commit_id, name)
);

CREATE TABLE commits (
  id TEXT NOT NULL,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  authored_at TEXT NOT NULL,
  parent_ids TEXT NOT NULL DEFAULT '[]',
  tree_id TEXT NOT NULL,
  signature_status TEXT NOT NULL DEFAULT 'unverified' CHECK (signature_status IN ('verified', 'unverified', 'invalid')),
  PRIMARY KEY (repository_id, id)
);

CREATE TABLE job_log_chunks (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (job_id, sequence)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL,
  name TEXT NOT NULL,
  check_name TEXT NOT NULL,
  required_labels_json TEXT NOT NULL DEFAULT '[]',
  steps_json TEXT NOT NULL,
  environment_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','success','failure','canceled')),
  runner_id TEXT REFERENCES runners(id),
  lease_token_hash TEXT,
  lease_expires_at TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 0,
  exit_code INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  artifact_paths_json TEXT NOT NULL DEFAULT '[]',
  runtime_json TEXT NOT NULL DEFAULT '{"image":"ubuntu:24.04","timeoutMinutes":360,"services":[]}',
  needs_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE (run_id, job_key)
);

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pull_realtime_updates (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (pull_request_id, version)
);

CREATE TABLE pull_request_assignees (
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (pull_request_id, user_id)
);

CREATE TABLE pull_request_comments (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE pull_request_events (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pull_request_labels (
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES repository_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (pull_request_id, label_id)
);

CREATE TABLE pull_request_reviews (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('commented', 'approved', 'changes_requested')),
  body TEXT NOT NULL DEFAULT '',
  commit_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pull_requests (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL REFERENCES users(id),
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  source_commit_id TEXT NOT NULL,
  target_commit_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('draft', 'open', 'merged', 'closed')),
  merged_commit_id TEXT,
  merged_by TEXT REFERENCES users(id),
  merged_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  merge_method TEXT CHECK (merge_method IN ('merge', 'squash', 'rebase')),
  locked_at TEXT,
  locked_by TEXT REFERENCES users(id),
  realtime_version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (repository_id, number)
);

CREATE TABLE pull_timeline (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'review', 'thread', 'event')),
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (kind, entity_id)
);

CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public')),
  default_branch TEXT NOT NULL DEFAULT 'main',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  deletion_scheduled_at TEXT,
  UNIQUE (organization_id, name)
);

CREATE TABLE repository_entries (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  tree_id TEXT NOT NULL,
  path TEXT NOT NULL,
  parent_path TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('blob', 'tree', 'commit')),
  object_id TEXT NOT NULL,
  byte_size INTEGER,
  PRIMARY KEY (repository_id, tree_id, path)
);

CREATE TABLE repository_labels (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE (repository_id, name)
);

CREATE TABLE review_comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES review_threads(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT);

CREATE TABLE review_threads (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('old', 'new')),
  line INTEGER NOT NULL,
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  commit_id TEXT,
  start_side TEXT CHECK (start_side IN ('old', 'new')),
  start_line INTEGER);

CREATE TABLE runner_enrollment_tokens (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE runners (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  labels_json TEXT NOT NULL DEFAULT '[]',
  concurrency INTEGER NOT NULL DEFAULT 1 CHECK (concurrency BETWEEN 1 AND 32),
  platform TEXT NOT NULL,
  architecture TEXT NOT NULL,
  version TEXT NOT NULL,
  active_jobs INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enrollment_id TEXT REFERENCES runner_enrollment_tokens(id),
  UNIQUE (organization_id, name)
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  trigger_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_id TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','success','failure','canceled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  UNIQUE (repository_id, number)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE INDEX audit_events_by_organization ON audit_events(organization_id, created_at DESC);

CREATE INDEX audit_events_by_repository ON audit_events(repository_id, created_at DESC);

CREATE INDEX checks_by_commit ON checks(repository_id, commit_id, updated_at DESC);

CREATE INDEX comments_by_thread ON review_comments(thread_id, created_at);

CREATE INDEX commits_by_time ON commits(repository_id, authored_at DESC);

CREATE INDEX jobs_by_runner ON jobs(runner_id, state);

CREATE INDEX jobs_queue ON jobs(state, created_at);

CREATE INDEX pull_realtime_updates_pull_version_idx
ON pull_realtime_updates(pull_request_id, version);

CREATE INDEX pull_request_comments_pull_created_idx ON pull_request_comments(pull_request_id, created_at);

CREATE INDEX pull_request_events_pull_created_idx
ON pull_request_events(pull_request_id, created_at, id);

CREATE INDEX pull_requests_by_state ON pull_requests(repository_id, state, updated_at DESC);

CREATE INDEX pull_timeline_pull_sequence_idx
ON pull_timeline(pull_request_id, sequence);

CREATE INDEX repositories_by_updated ON repositories(organization_id, updated_at DESC);

CREATE INDEX repository_entries_by_parent ON repository_entries(repository_id, tree_id, parent_path, kind, name);

CREATE INDEX review_threads_by_pull_commit
ON review_threads(pull_request_id, commit_id, created_at);

CREATE INDEX reviews_by_pull ON pull_request_reviews(pull_request_id, created_at);

CREATE UNIQUE INDEX runners_by_enrollment ON runners(enrollment_id) WHERE enrollment_id IS NOT NULL;

CREATE INDEX runners_by_org ON runners(organization_id, last_seen_at DESC);

CREATE INDEX runs_by_repository ON runs(repository_id, created_at DESC);

CREATE INDEX runs_by_workflow ON runs(workflow_id, created_at DESC);

CREATE INDEX sessions_by_user ON sessions(user_id);

CREATE INDEX workflows_by_repository ON workflows(repository_id, branch, active, name);

CREATE TRIGGER audit_events_immutable_delete BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable');
END;

CREATE TRIGGER audit_events_immutable_update BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable');
END;

CREATE TRIGGER pull_timeline_comment_insert
AFTER INSERT ON pull_request_comments
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'comment', NEW.id, NEW.created_at);
END;

CREATE TRIGGER pull_timeline_event_insert
AFTER INSERT ON pull_request_events
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'event', NEW.id, NEW.created_at);
END;

CREATE TRIGGER pull_timeline_review_insert
AFTER INSERT ON pull_request_reviews
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'review', NEW.id, NEW.created_at);
END;

CREATE TRIGGER pull_timeline_thread_insert
AFTER INSERT ON review_threads
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'thread', NEW.id, NEW.created_at);
END;
