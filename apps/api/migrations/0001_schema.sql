PRAGMA foreign_keys = ON;

CREATE TABLE artifact_upload_parts (
  upload_id TEXT NOT NULL REFERENCES artifact_uploads(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  PRIMARY KEY (upload_id, part_number)
);

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

CREATE TABLE auth_account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  issuer TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  id_token TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (issuer, account_id)
);

CREATE TABLE auth_passkey (
  id TEXT PRIMARY KEY,
  name TEXT,
  public_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  counter INTEGER NOT NULL,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL,
  transports TEXT,
  created_at INTEGER,
  aaguid TEXT
);

CREATE TABLE "auth_rate_limit" (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  last_request INTEGER NOT NULL
);

CREATE TABLE auth_session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, device_id TEXT);

CREATE TABLE auth_two_factor (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  failed_verification_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);

CREATE TABLE auth_user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, username TEXT, display_username TEXT);

CREATE TABLE auth_verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE "branch_rules" (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  required_approvals INTEGER NOT NULL DEFAULT 0 CHECK (required_approvals BETWEEN 0 AND 10),
  required_checks_json TEXT NOT NULL DEFAULT '[]',
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, index_version TEXT NOT NULL DEFAULT '',
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

CREATE TABLE ci_secrets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id TEXT REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE commit_changes (
  repository_id TEXT NOT NULL,
  commit_id TEXT NOT NULL,
  path TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repository_id, commit_id, path),
  FOREIGN KEY (repository_id, commit_id) REFERENCES commits(repository_id, id) ON DELETE CASCADE
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
  signature_status TEXT NOT NULL DEFAULT 'unverified' CHECK (signature_status IN ('verified', 'unverified', 'invalid')), signature_signer_id TEXT REFERENCES users(id), signature_key_fingerprint TEXT,
  PRIMARY KEY (repository_id, id)
);

CREATE TABLE indexed_commit_changes (
  repository_id TEXT NOT NULL,
  commit_id TEXT NOT NULL,
  PRIMARY KEY (repository_id, commit_id),
  FOREIGN KEY (repository_id, commit_id) REFERENCES commits(repository_id, id) ON DELETE CASCADE
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

CREATE TABLE organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, kind TEXT NOT NULL DEFAULT 'team' CHECK (kind IN ('personal','team')), base_repository_role TEXT CHECK (base_repository_role IN ('read','triage','write','maintain')), avatar_url TEXT, description TEXT NOT NULL DEFAULT '', website TEXT);

CREATE TABLE personal_access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  repository_ids_json TEXT,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
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
  realtime_version INTEGER NOT NULL DEFAULT 0, source_repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,
  UNIQUE (repository_id, number)
);

CREATE TABLE pull_timeline (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'review', 'thread', 'event', 'reference')),
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
  deletion_scheduled_at TEXT, forked_from_repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL, fork_root_repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL, overview_documents_json TEXT, icon_url TEXT,
  UNIQUE (organization_id, name)
);

CREATE TABLE repository_collaborators (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('read','triage','write','maintain','admin')),
  added_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, user_id)
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

CREATE TABLE repository_stars (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, user_id)
);

CREATE TABLE repository_team_grants (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('read','triage','write','maintain','admin')),
  added_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, team_id)
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
  workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL, cancellation_reason TEXT CHECK (cancellation_reason IN ('developer', 'superseded')),
  UNIQUE (repository_id, number)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ssh_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, slug)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, email TEXT, avatar_url TEXT, auth_user_id TEXT, bio TEXT NOT NULL DEFAULT '', website TEXT);

CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('marl', 'github')),
  triggers_json TEXT NOT NULL,
  jobs_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('valid', 'invalid')),
  error TEXT,
  commit_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, supersede_pushes INTEGER NOT NULL DEFAULT 1,
  UNIQUE(repository_id, branch, path)
);

CREATE INDEX artifact_uploads_by_expiry ON artifact_uploads(state, expires_at);

CREATE INDEX audit_events_by_organization ON audit_events(organization_id, created_at DESC);

CREATE INDEX audit_events_by_repository ON audit_events(repository_id, created_at DESC);

CREATE INDEX auth_accounts_by_user ON auth_account(user_id, provider_id);

CREATE INDEX auth_passkeys_by_user ON auth_passkey(user_id, created_at DESC);

CREATE UNIQUE INDEX auth_sessions_by_device ON auth_session(user_id, device_id) WHERE device_id IS NOT NULL;

CREATE INDEX auth_sessions_by_user ON auth_session(user_id, expires_at);

CREATE UNIQUE INDEX auth_two_factor_by_user ON auth_two_factor(user_id);

CREATE UNIQUE INDEX auth_user_username_unique ON auth_user(username COLLATE NOCASE) WHERE username IS NOT NULL;

CREATE INDEX auth_verifications_by_identifier ON auth_verification(identifier, expires_at);

CREATE INDEX branches_by_index_version ON branches(repository_id, index_version);

CREATE INDEX checks_by_commit ON checks(repository_id, commit_id, updated_at DESC);

CREATE UNIQUE INDEX ci_secrets_organization_name ON ci_secrets(organization_id,name) WHERE repository_id IS NULL;

CREATE UNIQUE INDEX ci_secrets_repository_name ON ci_secrets(repository_id,name) WHERE repository_id IS NOT NULL;

CREATE INDEX ci_secrets_scope ON ci_secrets(organization_id,repository_id,name);

CREATE INDEX comments_by_thread ON review_comments(thread_id, created_at);

CREATE INDEX commit_changes_by_path ON commit_changes(repository_id, path, commit_id);

CREATE INDEX commit_changes_by_position ON commit_changes(repository_id, path, position);

CREATE INDEX commits_by_time ON commits(repository_id, authored_at DESC);

CREATE INDEX commits_signature_signer ON commits(signature_signer_id,signature_key_fingerprint);

CREATE INDEX jobs_by_lease_expiry ON jobs(state, lease_expires_at) WHERE state = 'running';

CREATE INDEX jobs_by_runner ON jobs(runner_id, state);

CREATE INDEX jobs_queue ON jobs(state, created_at);

CREATE INDEX organization_invitations_by_email ON organization_invitations(email, expires_at);

CREATE INDEX organization_members_by_user ON organization_members(user_id, organization_id);

CREATE INDEX personal_access_tokens_by_user ON personal_access_tokens(user_id, created_at DESC);

CREATE INDEX pull_realtime_updates_pull_version_idx
ON pull_realtime_updates(pull_request_id, version);

CREATE INDEX pull_request_comments_pull_created_idx ON pull_request_comments(pull_request_id, created_at);

CREATE INDEX pull_request_events_pull_created_idx
ON pull_request_events(pull_request_id, created_at, id);

CREATE INDEX pull_requests_by_source_repository ON pull_requests(source_repository_id, state, source_branch);

CREATE INDEX pull_requests_by_state ON pull_requests(repository_id, state, updated_at DESC);

CREATE INDEX pull_timeline_pull_sequence_idx
ON pull_timeline(pull_request_id, sequence);

CREATE INDEX repositories_by_fork_parent ON repositories(forked_from_repository_id);

CREATE INDEX repositories_by_fork_root ON repositories(fork_root_repository_id);

CREATE INDEX repositories_by_updated ON repositories(organization_id, updated_at DESC);

CREATE INDEX repository_collaborators_by_user ON repository_collaborators(user_id, repository_id);

CREATE INDEX repository_entries_by_parent ON repository_entries(repository_id, tree_id, parent_path, kind, name);

CREATE INDEX repository_stars_by_user ON repository_stars(user_id, created_at DESC);

CREATE INDEX repository_team_grants_by_team ON repository_team_grants(team_id, repository_id);

CREATE INDEX review_threads_by_pull_commit
ON review_threads(pull_request_id, commit_id, created_at);

CREATE INDEX reviews_by_pull ON pull_request_reviews(pull_request_id, created_at);

CREATE UNIQUE INDEX runners_by_enrollment ON runners(enrollment_id) WHERE enrollment_id IS NOT NULL;

CREATE INDEX runners_by_org ON runners(organization_id, last_seen_at DESC);

CREATE INDEX runs_active_workflow_branch
ON runs(repository_id, workflow_id, branch, trigger_name, state);

CREATE INDEX runs_by_repository ON runs(repository_id, created_at DESC);

CREATE INDEX runs_by_workflow ON runs(workflow_id, created_at DESC);

CREATE INDEX sessions_by_user ON sessions(user_id);

CREATE INDEX ssh_keys_user ON ssh_keys(user_id,created_at DESC);

CREATE INDEX team_members_by_user ON team_members(user_id, team_id);

CREATE INDEX teams_by_organization ON teams(organization_id, slug);

CREATE UNIQUE INDEX users_by_auth_user ON users(auth_user_id) WHERE auth_user_id IS NOT NULL;

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

CREATE TRIGGER ssh_keys_invalidate_commit_signatures
AFTER DELETE ON ssh_keys
BEGIN
  UPDATE commits
  SET signature_status = 'unverified', signature_signer_id = NULL, signature_key_fingerprint = NULL
  WHERE signature_signer_id = OLD.user_id AND signature_key_fingerprint = OLD.fingerprint;
END;

CREATE INDEX repositories_by_recency
ON repositories(updated_at DESC, id DESC)
WHERE deletion_scheduled_at IS NULL;

CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL REFERENCES users(id),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  closed_by TEXT REFERENCES users(id),
  closed_at TEXT,
  locked_at TEXT,
  locked_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (repository_id, number)
);

CREATE TABLE issue_assignees (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, user_id)
);

CREATE TABLE issue_comments (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE issue_events (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE issue_labels (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES repository_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, label_id)
);

CREATE TABLE issue_timeline (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'event', 'reference')),
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (kind, entity_id)
);

CREATE TABLE work_item_references (
  id TEXT PRIMARY KEY,
  source_issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
  source_pull_id TEXT REFERENCES pull_requests(id) ON DELETE CASCADE,
  source_content_kind TEXT NOT NULL CHECK (source_content_kind IN ('body', 'comment')),
  source_content_id TEXT NOT NULL,
  target_issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
  target_pull_id TEXT REFERENCES pull_requests(id) ON DELETE CASCADE,
  closes_target INTEGER NOT NULL DEFAULT 0 CHECK (closes_target IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((source_issue_id IS NOT NULL) != (source_pull_id IS NOT NULL)),
  CHECK ((target_issue_id IS NOT NULL) != (target_pull_id IS NOT NULL))
);

CREATE INDEX issues_by_state ON issues(repository_id, state, updated_at DESC, id DESC);
CREATE INDEX issues_by_author ON issues(author_id, updated_at DESC);
CREATE INDEX issue_comments_issue_created ON issue_comments(issue_id, created_at, id);
CREATE INDEX issue_events_issue_created ON issue_events(issue_id, created_at, id);
CREATE INDEX issue_timeline_issue_sequence ON issue_timeline(issue_id, sequence);
CREATE INDEX issue_assignees_user ON issue_assignees(user_id, issue_id);
CREATE INDEX issue_labels_label ON issue_labels(label_id, issue_id);
CREATE INDEX work_item_references_source_issue ON work_item_references(source_issue_id);
CREATE INDEX work_item_references_source_pull ON work_item_references(source_pull_id);
CREATE INDEX work_item_references_target_issue ON work_item_references(target_issue_id);
CREATE INDEX work_item_references_target_pull ON work_item_references(target_pull_id);
CREATE INDEX work_item_references_content ON work_item_references(source_content_kind, source_content_id);
CREATE UNIQUE INDEX work_item_references_issue_target ON work_item_references(source_content_kind, source_content_id, target_issue_id) WHERE target_issue_id IS NOT NULL;
CREATE UNIQUE INDEX work_item_references_pull_target ON work_item_references(source_content_kind, source_content_id, target_pull_id) WHERE target_pull_id IS NOT NULL;

CREATE TRIGGER issue_timeline_comment_insert
AFTER INSERT ON issue_comments
BEGIN
  INSERT INTO issue_timeline (issue_id, kind, entity_id, created_at)
  VALUES (NEW.issue_id, 'comment', NEW.id, NEW.created_at);
END;

CREATE TRIGGER issue_timeline_event_insert
AFTER INSERT ON issue_events
BEGIN
  INSERT INTO issue_timeline (issue_id, kind, entity_id, created_at)
  VALUES (NEW.issue_id, 'event', NEW.id, NEW.created_at);
END;

CREATE TRIGGER issue_timeline_reference_insert
AFTER INSERT ON work_item_references
WHEN NEW.target_issue_id IS NOT NULL
BEGIN
  INSERT INTO issue_timeline (issue_id, kind, entity_id, created_at)
  VALUES (NEW.target_issue_id, 'reference', NEW.id, NEW.created_at);
END;

CREATE TRIGGER issue_timeline_reference_delete
AFTER DELETE ON work_item_references
WHEN OLD.target_issue_id IS NOT NULL
BEGIN
  DELETE FROM issue_timeline WHERE kind = 'reference' AND entity_id = OLD.id;
END;

CREATE TRIGGER pull_timeline_reference_insert
AFTER INSERT ON work_item_references
WHEN NEW.target_pull_id IS NOT NULL
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.target_pull_id, 'reference', NEW.id, NEW.created_at);
END;

CREATE TRIGGER pull_timeline_reference_delete
AFTER DELETE ON work_item_references
WHEN OLD.target_pull_id IS NOT NULL
BEGIN
  DELETE FROM pull_timeline WHERE kind = 'reference' AND entity_id = OLD.id;
END;
