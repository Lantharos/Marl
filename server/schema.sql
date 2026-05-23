CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'cli',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_tokens_kind ON tokens(kind);
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
    folder TEXT,
    settings_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (tenant, project)
);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_folder ON projects(tenant, folder, project);
CREATE TABLE IF NOT EXISTS project_folders (
    tenant TEXT NOT NULL,
    path TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, path)
);
CREATE INDEX IF NOT EXISTS idx_project_folders_tenant ON project_folders(tenant, path);
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
    labels_json TEXT NOT NULL DEFAULT '[]',
    visibility TEXT NOT NULL DEFAULT 'team',
    created_by TEXT,
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
    snapshot_id TEXT,
    agent TEXT,
    model TEXT,
    signature_json TEXT
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
    updated_at TEXT,
    closed_at TEXT,
    assignees_json TEXT NOT NULL DEFAULT '[]',
    milestone TEXT,
    workspace TEXT,
    labels_json TEXT NOT NULL DEFAULT '[]'
);
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
CREATE TABLE IF NOT EXISTS protocol_reactions (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    user TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, target_kind, target_id, emoji, user)
);
CREATE INDEX IF NOT EXISTS idx_protocol_reactions_target ON protocol_reactions(tenant, project, target_kind, target_id);
CREATE TABLE IF NOT EXISTS workspace_reviews (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    author TEXT NOT NULL,
    state TEXT NOT NULL,
    body TEXT,
    head TEXT,
    submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspace_reviews_scope ON workspace_reviews(tenant, project, workspace, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_reviews_head ON workspace_reviews(tenant, project, workspace, head, author, submitted_at DESC);
CREATE TABLE IF NOT EXISTS workspace_checks (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    head TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    conclusion TEXT,
    summary TEXT,
    details_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_checks_unique ON workspace_checks(tenant, project, workspace, head, name);
CREATE INDEX IF NOT EXISTS idx_workspace_checks_scope ON workspace_checks(tenant, project, workspace, head);
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_project_time ON audit_log(tenant, project, created_at DESC);
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    href TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON notifications(user, read_at, created_at DESC);
CREATE TABLE IF NOT EXISTS leaves (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'tenant',
    attached_type TEXT NOT NULL DEFAULT 'project',
    attached_id TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    pinned INTEGER NOT NULL DEFAULT 0,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant, project, slug)
);
CREATE INDEX IF NOT EXISTS idx_leaves_scope_updated ON leaves(tenant, project, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaves_scope_pinned ON leaves(tenant, project, pinned, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaves_attachment ON leaves(tenant, project, attached_type, attached_id);
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
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS object_index (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    id TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, id)
);
CREATE INDEX IF NOT EXISTS idx_history_workspace ON history(tenant, project, workspace);
CREATE INDEX IF NOT EXISTS idx_history_workspace_time ON history(tenant, project, workspace, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_history_project_time ON history(tenant, project, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(tenant, project);
CREATE INDEX IF NOT EXISTS idx_workspace_states_ready ON workspace_states(is_ready, tenant, project, workspace);
CREATE INDEX IF NOT EXISTS idx_issues_status_updated ON issues(status, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(tenant, project, issue_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
CREATE TABLE IF NOT EXISTS remote_approvals (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_remote_approvals_user_status ON remote_approvals(user, status);
CREATE TABLE IF NOT EXISTS project_stats (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace_count INTEGER NOT NULL DEFAULT 0,
    open_issue_count INTEGER NOT NULL DEFAULT 0,
    ready_count INTEGER NOT NULL DEFAULT 0,
    release_count INTEGER NOT NULL DEFAULT 0,
    history_count INTEGER NOT NULL DEFAULT 0,
    leaf_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project)
);
CREATE TABLE IF NOT EXISTS project_api_keys (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    name TEXT NOT NULL,
    scopes_json TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    expires_at TEXT,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_project_api_keys_project ON project_api_keys(tenant, project, revoked_at);
CREATE INDEX IF NOT EXISTS idx_project_api_keys_hash ON project_api_keys(token_hash);
CREATE TABLE IF NOT EXISTS project_webhooks (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events_json TEXT NOT NULL,
    secret TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_delivery_at TEXT,
    last_delivery_status INTEGER,
    active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_project_webhooks_project ON project_webhooks(tenant, project, active);
CREATE TABLE IF NOT EXISTS developer_apps (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    homepage_url TEXT,
    redirect_uri TEXT NOT NULL,
    client_id TEXT NOT NULL UNIQUE,
    client_secret_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_developer_apps_owner ON developer_apps(owner, revoked_at);
CREATE INDEX IF NOT EXISTS idx_developer_apps_client ON developer_apps(client_id);
CREATE TABLE IF NOT EXISTS oauth_codes (
    code_hash TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    user TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    scopes_json TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    state TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_app ON oauth_codes(app_id, expires_at);
CREATE TABLE IF NOT EXISTS project_integrations (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    scopes_json TEXT NOT NULL,
    installed_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_project_integrations_project ON project_integrations(tenant, project, revoked_at);
CREATE TABLE IF NOT EXISTS project_forks (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    source_tenant TEXT NOT NULL,
    source_project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sent_at TEXT,
    title TEXT,
    message TEXT,
    PRIMARY KEY (tenant, project)
);
CREATE INDEX IF NOT EXISTS idx_project_forks_source ON project_forks(source_tenant, source_project);
