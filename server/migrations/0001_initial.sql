CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at);

CREATE TABLE IF NOT EXISTS user_profiles (
    user TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    handle TEXT,
    avatar_url TEXT,
    email TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
    name TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    owner TEXT NOT NULL,
    members_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    owner TEXT NOT NULL,
    settings_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (tenant, project)
);

CREATE TABLE IF NOT EXISTS workspace_heads (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    head TEXT,
    PRIMARY KEY (tenant, project, workspace)
);

CREATE TABLE IF NOT EXISTS workspace_states (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    is_ready INTEGER NOT NULL DEFAULT 0,
    parent_workspace TEXT,
    mergeable INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant, project, workspace)
);

CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    author TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    snapshot_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_workspace ON history(tenant, project, workspace);
CREATE INDEX IF NOT EXISTS idx_history_project_time ON history(tenant, project, timestamp DESC);

CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    closed_at TEXT,
    state_reason TEXT,
    assignees_json TEXT NOT NULL DEFAULT '[]',
    milestone TEXT,
    workspace TEXT,
    issue_type TEXT,
    locked INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    labels_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(tenant, project);

CREATE TABLE IF NOT EXISTS protocol_items (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    kind TEXT NOT NULL,
    number INTEGER,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_protocol_items_project_kind ON protocol_items(tenant, project, kind);

CREATE TABLE IF NOT EXISTS project_follows (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    user TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, user)
);
CREATE INDEX IF NOT EXISTS idx_project_follows_user ON project_follows(user, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    issue_id TEXT NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT 'comment',
    target_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(tenant, project, issue_id);

CREATE TABLE IF NOT EXISTS object_index (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    id TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, id)
);
