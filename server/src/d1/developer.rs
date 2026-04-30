use super::*;

mod api_keys;
mod apps;
mod webhooks;

pub use api_keys::*;
pub use apps::*;
pub use webhooks::*;

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct ProjectApiKey {
    pub id: String,
    pub prefix: String,
    pub tenant: String,
    pub project: String,
    pub name: String,
    pub scopes: Vec<String>,
    pub created_by: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub expires_at: Option<String>,
    pub revoked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct ProjectWebhook {
    pub id: String,
    pub tenant: String,
    pub project: String,
    pub name: String,
    pub url: String,
    pub events: Vec<String>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_delivery_at: Option<String>,
    pub last_delivery_status: Option<i64>,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret: Option<String>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct DeveloperApp {
    pub id: String,
    pub owner: String,
    pub name: String,
    pub description: Option<String>,
    pub homepage_url: Option<String>,
    pub redirect_uri: String,
    pub client_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub revoked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct ProjectIntegration {
    pub id: String,
    pub tenant: String,
    pub project: String,
    pub app_id: String,
    pub app_name: String,
    pub scopes: Vec<String>,
    pub installed_by: String,
    pub created_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OAuthGrant {
    pub access_token: String,
    pub expires_at: Option<String>,
    pub scope: String,
    pub tenant: String,
    pub project: String,
    pub integration_id: String,
}

#[derive(Deserialize)]
pub(super) struct ApiKeyRow {
    pub id: String,
    pub prefix: String,
    pub tenant: String,
    pub project: String,
    pub name: String,
    pub scopes_json: String,
    pub created_by: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub expires_at: Option<String>,
    pub revoked_at: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WebhookRow {
    pub id: String,
    pub tenant: String,
    pub project: String,
    pub name: String,
    pub url: String,
    pub events_json: String,
    pub secret: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_delivery_at: Option<String>,
    pub last_delivery_status: Option<i64>,
    pub active: i64,
}

#[derive(Deserialize)]
pub(super) struct DeveloperAppRow {
    pub id: String,
    pub owner: String,
    pub name: String,
    pub description: Option<String>,
    pub homepage_url: Option<String>,
    pub redirect_uri: String,
    pub client_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct ProjectIntegrationRow {
    pub id: String,
    pub tenant: String,
    pub project: String,
    pub app_id: String,
    pub app_name: String,
    pub scopes_json: String,
    pub installed_by: String,
    pub created_at: String,
    pub revoked_at: Option<String>,
}

pub async fn ensure_developer_schema(db: &D1Database) -> Result<()> {
    db.prepare("CREATE TABLE IF NOT EXISTS project_api_keys (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, tenant TEXT NOT NULL, project TEXT NOT NULL, name TEXT NOT NULL, scopes_json TEXT NOT NULL DEFAULT '[]', created_by TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT, expires_at TEXT, revoked_at TEXT)").run().await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_project_api_keys_project ON project_api_keys(tenant, project, revoked_at)").run().await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_project_api_keys_hash ON project_api_keys(token_hash)",
    )
    .run()
    .await?;
    db.prepare("CREATE TABLE IF NOT EXISTS project_webhooks (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, project TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, events_json TEXT NOT NULL, secret TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_delivery_at TEXT, last_delivery_status INTEGER, active INTEGER NOT NULL DEFAULT 1)").run().await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_project_webhooks_project ON project_webhooks(tenant, project, active)").run().await?;
    db.prepare("CREATE TABLE IF NOT EXISTS developer_apps (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, description TEXT, homepage_url TEXT, redirect_uri TEXT NOT NULL, client_id TEXT NOT NULL UNIQUE, client_secret_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revoked_at TEXT)").run().await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_developer_apps_owner ON developer_apps(owner, revoked_at)",
    )
    .run()
    .await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_developer_apps_client ON developer_apps(client_id)")
        .run()
        .await?;
    db.prepare("CREATE TABLE IF NOT EXISTS oauth_codes (code_hash TEXT PRIMARY KEY, app_id TEXT NOT NULL, user TEXT NOT NULL, tenant TEXT NOT NULL, project TEXT NOT NULL, scopes_json TEXT NOT NULL, redirect_uri TEXT NOT NULL, state TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT)").run().await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_oauth_codes_app ON oauth_codes(app_id, expires_at)")
        .run()
        .await?;
    db.prepare("CREATE TABLE IF NOT EXISTS project_integrations (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, project TEXT NOT NULL, app_id TEXT NOT NULL, app_name TEXT NOT NULL, scopes_json TEXT NOT NULL, installed_by TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)").run().await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_project_integrations_project ON project_integrations(tenant, project, revoked_at)").run().await?;
    Ok(())
}

pub(super) fn api_key_from_row(row: ApiKeyRow) -> ProjectApiKey {
    ProjectApiKey {
        id: row.id,
        prefix: row.prefix,
        tenant: row.tenant,
        project: row.project,
        name: row.name,
        scopes: normalize_scopes(&json_vec(&row.scopes_json)),
        created_by: row.created_by,
        created_at: row.created_at,
        last_used_at: row.last_used_at,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at,
        token: None,
    }
}

pub(super) fn webhook_from_row(row: WebhookRow) -> ProjectWebhook {
    ProjectWebhook {
        id: row.id,
        tenant: row.tenant,
        project: row.project,
        name: row.name,
        url: row.url,
        events: json_vec(&row.events_json),
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_delivery_at: row.last_delivery_at,
        last_delivery_status: row.last_delivery_status,
        active: row.active != 0,
        secret: row.secret,
    }
}

pub(super) fn app_from_row(row: DeveloperAppRow) -> DeveloperApp {
    DeveloperApp {
        id: row.id,
        owner: row.owner,
        name: row.name,
        description: row.description,
        homepage_url: row.homepage_url,
        redirect_uri: row.redirect_uri,
        client_id: row.client_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        revoked_at: row.revoked_at,
        client_secret: None,
    }
}

pub(super) fn integration_from_row(row: ProjectIntegrationRow) -> ProjectIntegration {
    ProjectIntegration {
        id: row.id,
        tenant: row.tenant,
        project: row.project,
        app_id: row.app_id,
        app_name: row.app_name,
        scopes: json_vec(&row.scopes_json),
        installed_by: row.installed_by,
        created_at: row.created_at,
        revoked_at: row.revoked_at,
    }
}

pub(super) fn normalize_events(events: &[String]) -> Vec<String> {
    let mut values = events
        .iter()
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    if values.is_empty() {
        values.push("snapshot.shipped".to_string());
    }
    values
}

const ALL_SCOPES: &[&str] = &[
    "main:read",
    "main:write",
    "workspaces:read",
    "workspaces:create",
    "workspaces:write",
    "workspaces:ready",
    "workspaces:merge",
    "issues:read",
    "issues:write",
    "releases:read",
    "releases:write",
    "webhooks:read",
    "webhooks:write",
    "settings:read",
    "settings:write",
];

const READ_SCOPES: &[&str] = &[
    "main:read",
    "workspaces:read",
    "issues:read",
    "releases:read",
];

const WRITE_SCOPES: &[&str] = &[
    "main:write",
    "workspaces:create",
    "workspaces:write",
    "workspaces:ready",
    "issues:write",
    "releases:write",
];

pub(super) fn normalize_scopes(scopes: &[String]) -> Vec<String> {
    let mut values = scopes
        .iter()
        .flat_map(|value| expand_scope(value))
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    if values.is_empty() {
        values.push("main:read".to_string());
    }
    values
}

pub(super) fn role_for_scopes(scopes: &[String]) -> &'static str {
    if scope_allows(scopes, "settings:write")
        || scope_allows(scopes, "workspaces:merge")
        || scope_allows(scopes, "webhooks:write")
    {
        ROLE_MAINTAINER
    } else if scope_allows(scopes, "main:write")
        || scope_allows(scopes, "workspaces:create")
        || scope_allows(scopes, "workspaces:write")
        || scope_allows(scopes, "workspaces:ready")
        || scope_allows(scopes, "issues:write")
        || scope_allows(scopes, "releases:write")
    {
        ROLE_CONTRIBUTOR
    } else {
        ROLE_VIEWER
    }
}

pub(super) fn scope_allows(scopes: &[String], required: &str) -> bool {
    if scopes
        .iter()
        .any(|scope| scope == "admin" || scope == required)
    {
        return true;
    }
    match required {
        "main:read" => scopes.iter().any(|scope| scope == "main:write"),
        "workspaces:read" => scopes.iter().any(|scope| {
            matches!(
                scope.as_str(),
                "workspaces:create" | "workspaces:write" | "workspaces:ready" | "workspaces:merge"
            )
        }),
        "issues:read" => scopes.iter().any(|scope| scope == "issues:write"),
        "releases:read" => scopes.iter().any(|scope| scope == "releases:write"),
        "webhooks:read" => scopes.iter().any(|scope| scope == "webhooks:write"),
        "settings:read" => scopes.iter().any(|scope| scope == "settings:write"),
        "objects:read" | "history:read" => scopes.iter().any(|scope| {
            matches!(
                scope.as_str(),
                "main:read"
                    | "main:write"
                    | "workspaces:read"
                    | "workspaces:create"
                    | "workspaces:write"
                    | "workspaces:ready"
                    | "workspaces:merge"
            )
        }),
        "objects:write" | "history:write" => scopes.iter().any(|scope| {
            matches!(
                scope.as_str(),
                "main:write" | "workspaces:create" | "workspaces:write" | "workspaces:ready"
            )
        }),
        _ => false,
    }
}

fn expand_scope(value: &String) -> Vec<String> {
    let value = value.trim().to_ascii_lowercase();
    match value.as_str() {
        "" => Vec::new(),
        "read" => READ_SCOPES
            .iter()
            .map(|scope| (*scope).to_string())
            .collect(),
        "write" => WRITE_SCOPES
            .iter()
            .map(|scope| (*scope).to_string())
            .collect(),
        "maintain" | "admin" => ALL_SCOPES
            .iter()
            .map(|scope| (*scope).to_string())
            .collect(),
        scope if ALL_SCOPES.contains(&scope) => vec![scope.to_string()],
        _ => Vec::new(),
    }
}

pub(super) fn json_vec(value: &str) -> Vec<String> {
    serde_json::from_str(value).unwrap_or_default()
}

pub(super) fn new_token(prefix: &str) -> String {
    format!(
        "{}_{}_{}",
        prefix,
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

pub(super) fn minutes_from_now(minutes: f64) -> String {
    let date = js_sys::Date::new_0();
    date.set_time(date.get_time() + minutes * 60.0 * 1000.0);
    date.to_iso_string().into()
}

pub(super) fn is_expired(value: &str) -> bool {
    value <= now_rfc3339().as_str()
}

pub(super) fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    let mut diff = a.len() ^ b.len();
    for index in 0..a.len().max(b.len()) {
        diff |= a.get(index).copied().unwrap_or(0) as usize
            ^ b.get(index).copied().unwrap_or(0) as usize;
    }
    diff == 0
}
