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
