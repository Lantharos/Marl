PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sessions_by_user ON sessions(user_id);

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
  UNIQUE (organization_id, name)
);
CREATE INDEX repositories_by_updated ON repositories(organization_id, updated_at DESC);

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
CREATE INDEX commits_by_time ON commits(repository_id, authored_at DESC);

CREATE TABLE branches (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  commit_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, name),
  FOREIGN KEY (repository_id, commit_id) REFERENCES commits(repository_id, id)
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
CREATE INDEX repository_entries_by_parent ON repository_entries(repository_id, tree_id, parent_path, kind, name);
