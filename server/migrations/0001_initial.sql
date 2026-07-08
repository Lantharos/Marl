CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_used_at TEXT,
    kind TEXT NOT NULL DEFAULT 'cli'
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
    updated_at TEXT NOT NULL,
    settings_json TEXT NOT NULL DEFAULT '{}'
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
    labels_json TEXT NOT NULL DEFAULT '[]',
    reviewers_json TEXT NOT NULL DEFAULT '[]',
    assignees_json TEXT NOT NULL DEFAULT '[]',
    milestone TEXT,
    linked_issues_json TEXT NOT NULL DEFAULT '[]',
    locked INTEGER NOT NULL DEFAULT 0,
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
    labels_json TEXT NOT NULL DEFAULT '[]',
    components_json TEXT NOT NULL DEFAULT '[]'
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

CREATE TABLE IF NOT EXISTS user_keys (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_keys_user_kind ON user_keys(user, kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_keys_user_fingerprint ON user_keys(user, fingerprint);

CREATE INDEX IF NOT EXISTS idx_tokens_kind ON tokens(kind);

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

INSERT OR REPLACE INTO project_stats (
    tenant,
    project,
    workspace_count,
    open_issue_count,
    ready_count,
    release_count,
    history_count,
    updated_at
)
SELECT
    p.tenant,
    p.project,
    (SELECT COUNT(*) FROM workspace_states ws WHERE ws.tenant = p.tenant AND ws.project = p.project AND ws.workspace != 'main' AND ws.status NOT IN ('merged', 'closed', 'not_planned', 'deleted')),
    (SELECT COUNT(*) FROM issues i WHERE i.tenant = p.tenant AND i.project = p.project AND i.status = 'open'),
    (SELECT COUNT(*) FROM workspace_states ws WHERE ws.tenant = p.tenant AND ws.project = p.project AND ws.workspace != 'main' AND ws.is_ready = 1),
    (SELECT COUNT(*) FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release'),
    (SELECT COUNT(*) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM projects p;

CREATE TABLE IF NOT EXISTS tenant_members (
    tenant TEXT NOT NULL,
    user TEXT NOT NULL,
    role TEXT NOT NULL,
    added_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, user)
);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user, tenant);

CREATE TABLE IF NOT EXISTS project_members (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    user TEXT NOT NULL,
    role TEXT NOT NULL,
    added_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, user)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user, tenant, project);

INSERT OR IGNORE INTO tenant_members (tenant, user, role, added_by, created_at, updated_at)
SELECT tenants.name, json_each.value, 'maintainer', tenants.owner, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tenants, json_each(tenants.members_json)
WHERE json_each.value != tenants.owner;

ALTER TABLE projects ADD COLUMN archived_at TEXT;
ALTER TABLE projects ADD COLUMN archived_by TEXT;

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

CREATE INDEX IF NOT EXISTS idx_workspace_states_ready ON workspace_states(is_ready, tenant, project, workspace);
CREATE INDEX IF NOT EXISTS idx_issues_status_updated ON issues(status, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);

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

ALTER TABLE history ADD COLUMN agent TEXT;
ALTER TABLE history ADD COLUMN model TEXT;
ALTER TABLE history ADD COLUMN signature_json TEXT;
CREATE INDEX IF NOT EXISTS idx_history_workspace_time ON history(tenant, project, workspace, timestamp DESC);

ALTER TABLE projects ADD COLUMN folder TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_tenant_folder ON projects(tenant, folder, project);

CREATE TABLE IF NOT EXISTS project_folders (
    tenant TEXT NOT NULL,
    path TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, path)
);
CREATE INDEX IF NOT EXISTS idx_project_folders_tenant ON project_folders(tenant, path);

CREATE TABLE IF NOT EXISTS user_pinned_projects (
    user TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    position INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user, tenant, project)
);

CREATE INDEX IF NOT EXISTS idx_user_pinned_projects_user_position
ON user_pinned_projects(user, position);

UPDATE project_stats
SET
    workspace_count = (
        SELECT COUNT(*)
        FROM workspace_states ws
        WHERE ws.tenant = project_stats.tenant
          AND ws.project = project_stats.project
          AND ws.workspace != 'main'
          AND ws.status NOT IN ('merged', 'closed', 'not_planned', 'deleted')
    ),
    ready_count = (
        SELECT COUNT(*)
        FROM workspace_states ws
        WHERE ws.tenant = project_stats.tenant
          AND ws.project = project_stats.project
          AND ws.workspace != 'main'
          AND ws.status != 'deleted'
          AND ws.is_ready = 1
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

CREATE INDEX IF NOT EXISTS idx_protocol_items_project_kind_created
ON protocol_items(tenant, project, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_issues_project_number
ON issues(tenant, project, number DESC);

CREATE INDEX IF NOT EXISTS idx_issues_project_status_number
ON issues(tenant, project, status, number DESC);

CREATE INDEX IF NOT EXISTS idx_comments_project_issue_target
ON comments(tenant, project, issue_id, target_type);

CREATE INDEX IF NOT EXISTS idx_workspace_states_project_status
ON workspace_states(tenant, project, status, workspace);

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

CREATE INDEX IF NOT EXISTS idx_leaves_scope_updated
ON leaves(tenant, project, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaves_scope_pinned
ON leaves(tenant, project, pinned, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaves_attachment
ON leaves(tenant, project, attached_type, attached_id);

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

CREATE INDEX IF NOT EXISTS idx_protocol_reactions_target
ON protocol_reactions(tenant, project, target_kind, target_id);

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

CREATE INDEX IF NOT EXISTS idx_workspace_reviews_scope
ON workspace_reviews(tenant, project, workspace, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_reviews_head
ON workspace_reviews(tenant, project, workspace, head, author, submitted_at DESC);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_checks_unique
ON workspace_checks(tenant, project, workspace, head, name);

CREATE INDEX IF NOT EXISTS idx_workspace_checks_scope
ON workspace_checks(tenant, project, workspace, head);

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

CREATE INDEX IF NOT EXISTS idx_audit_log_project_time
ON audit_log(tenant, project, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_notifications_user_time
ON notifications(user, read_at, created_at DESC);

UPDATE workspace_states
SET visibility = 'public'
WHERE workspace = 'main';

UPDATE workspace_states
SET visibility = 'team'
WHERE workspace != 'main'
  AND visibility NOT IN ('private', 'team', 'public');

UPDATE workspace_states
SET created_by = (
    SELECT h.author
    FROM history h
    WHERE h.tenant = workspace_states.tenant
      AND h.project = workspace_states.project
      AND h.workspace = workspace_states.workspace
    ORDER BY h.timestamp ASC
    LIMIT 1
)
WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_states_visibility
ON workspace_states(tenant, project, visibility, status);

CREATE TABLE IF NOT EXISTS ci_runners (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    disabled_at TEXT,
    concurrency INTEGER NOT NULL DEFAULT 1,
    labels_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_ci_runners_project
ON ci_runners(tenant, project, disabled_at, created_at DESC);

CREATE TABLE IF NOT EXISTS ci_jobs (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    head TEXT NOT NULL,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    timeout_seconds INTEGER NOT NULL,
    status TEXT NOT NULL,
    conclusion TEXT,
    summary TEXT,
    runner_id TEXT,
    lease_expires_at TEXT,
    attempt INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    artifacts_json TEXT NOT NULL DEFAULT '[]',
    cache_json TEXT NOT NULL DEFAULT '[]',
    queued_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ci_jobs_project
ON ci_jobs(tenant, project, workspace, head, queued_at DESC);

CREATE INDEX IF NOT EXISTS idx_ci_jobs_queue
ON ci_jobs(tenant, project, status, queued_at);

CREATE TABLE IF NOT EXISTS ci_job_logs (
    job_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    stream TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (job_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_ci_job_logs_job
ON ci_job_logs(job_id, seq);

CREATE INDEX IF NOT EXISTS idx_ci_jobs_leases
ON ci_jobs(tenant, project, status, lease_expires_at);

CREATE TABLE IF NOT EXISTS ci_artifacts (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    name TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL,
    digest TEXT NOT NULL,
    content_type TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ci_artifacts_job
ON ci_artifacts(tenant, project, job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ci_caches (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    size INTEGER NOT NULL,
    digest TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'raw',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, cache_key)
);

CREATE TABLE IF NOT EXISTS project_webhook_deliveries (
    delivery_id TEXT PRIMARY KEY,
    hook_id TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    event TEXT NOT NULL,
    status INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_webhook_deliveries_hook
ON project_webhook_deliveries(tenant, project, hook_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ci_secrets (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, key)
);

CREATE INDEX IF NOT EXISTS idx_ci_jobs_runner_active
ON ci_jobs(runner_id, status);

CREATE INDEX IF NOT EXISTS idx_ci_artifacts_project_created
ON ci_artifacts(tenant, project, created_at);

CREATE INDEX IF NOT EXISTS idx_ci_caches_project_updated
ON ci_caches(tenant, project, updated_at);
