CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user TEXT NOT NULL
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
    labels_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS stars (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    user TEXT NOT NULL,
    PRIMARY KEY (tenant, project, user)
);
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    issue_id TEXT NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_workspace ON history(tenant, project, workspace);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(tenant, project);
CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(tenant, project, issue_id);
