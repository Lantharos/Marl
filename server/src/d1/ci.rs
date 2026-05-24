use super::*;
use serde::{Deserialize, Serialize};

mod jobs;
mod storage;

pub use jobs::*;
pub use storage::*;

#[derive(Debug, Clone, Serialize)]
pub struct CiRunner {
    pub id: String,
    pub tenant: String,
    pub project: String,
    pub name: String,
    pub prefix: String,
    pub created_by: String,
    pub created_at: String,
    pub concurrency: u32,
    pub last_seen_at: Option<String>,
    pub disabled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CiJob {
    pub id: String,
    pub tenant: String,
    pub project: String,
    pub workspace: String,
    pub head: String,
    pub name: String,
    pub command: String,
    pub timeout_seconds: u32,
    pub status: String,
    pub conclusion: Option<String>,
    pub summary: Option<String>,
    pub runner_id: Option<String>,
    pub lease_expires_at: Option<String>,
    pub attempt: u32,
    pub max_attempts: u32,
    pub artifacts: Vec<String>,
    pub cache: Vec<sty_protocol::CiCacheEntry>,
    pub queued_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CiLogLine {
    pub seq: u64,
    pub stream: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Deserialize)]
struct CiRunnerRow {
    id: String,
    tenant: String,
    project: String,
    name: String,
    prefix: String,
    created_by: String,
    created_at: String,
    concurrency: f64,
    last_seen_at: Option<String>,
    disabled_at: Option<String>,
}

pub async fn ensure_ci_schema(db: &Database) -> Result<()> {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS ci_runners (
            id TEXT PRIMARY KEY,
            token_hash TEXT NOT NULL UNIQUE,
            prefix TEXT NOT NULL,
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            name TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            concurrency INTEGER NOT NULL DEFAULT 1,
            last_seen_at TEXT,
            disabled_at TEXT
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_ci_runners_project
         ON ci_runners(tenant, project, disabled_at, created_at DESC)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE TABLE IF NOT EXISTS ci_jobs (
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
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_ci_jobs_project
         ON ci_jobs(tenant, project, workspace, head, queued_at DESC)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_ci_jobs_queue
         ON ci_jobs(tenant, project, status, queued_at)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_ci_jobs_leases
         ON ci_jobs(tenant, project, status, lease_expires_at)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE TABLE IF NOT EXISTS ci_job_logs (
            job_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            stream TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (job_id, seq)
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_ci_job_logs_job
         ON ci_job_logs(job_id, seq)",
    )
    .run()
    .await?;
    ensure_ci_storage_schema(db).await?;
    Ok(())
}

pub async fn create_ci_runner(
    db: &Database,
    tenant: &str,
    project: &str,
    user: &str,
    name: &str,
    concurrency: u32,
) -> Result<CiRunner> {
    ensure_ci_schema(db).await?;
    let token = format!("sty_ci_{}", Uuid::new_v4().simple());
    let id = format!("cir_{}", Uuid::new_v4().simple());
    let prefix = token.chars().take(18).collect::<String>();
    let now = now_rfc3339();
    let concurrency = concurrency.clamp(1, 32);
    db.prepare(
        "INSERT INTO ci_runners
         (id, token_hash, prefix, tenant, project, name, created_by, created_at, concurrency, last_seen_at, disabled_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, NULL)",
    )
    .bind(&[
        js_str(&id),
        js_str(&token_hash(&token)),
        js_str(&prefix),
        js_str(tenant),
        js_str(project),
        js_str(name.trim()),
        js_str(user),
        js_str(&now),
        wasm_bindgen::JsValue::from_f64(concurrency as f64),
    ])?
    .run()
    .await?;
    Ok(CiRunner {
        id,
        tenant: tenant.to_string(),
        project: project.to_string(),
        name: name.trim().to_string(),
        prefix,
        created_by: user.to_string(),
        created_at: now,
        concurrency,
        last_seen_at: None,
        disabled_at: None,
        token: Some(token),
    })
}

pub async fn list_ci_runners(db: &Database, tenant: &str, project: &str) -> Result<Vec<CiRunner>> {
    ensure_ci_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, tenant, project, name, prefix, created_by, created_at, concurrency, last_seen_at, disabled_at
             FROM ci_runners
             WHERE tenant = ?1 AND project = ?2
             ORDER BY disabled_at IS NOT NULL, created_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<CiRunnerRow> = result.results()?;
    Ok(rows.into_iter().map(ci_runner_from_row).collect())
}

pub async fn disable_ci_runner(
    db: &Database,
    tenant: &str,
    project: &str,
    runner_id: &str,
) -> Result<bool> {
    ensure_ci_schema(db).await?;
    let result = db
        .prepare(
            "UPDATE ci_runners
             SET disabled_at = COALESCE(disabled_at, ?1)
             WHERE tenant = ?2 AND project = ?3 AND id = ?4",
        )
        .bind(&[
            js_str(&now_rfc3339()),
            js_str(tenant),
            js_str(project),
            js_str(runner_id),
        ])?
        .run()
        .await?;
    Ok(result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) > 0)
}

pub async fn principal_for_ci_runner(db: &Database, token: &str) -> Result<Option<TokenPrincipal>> {
    let Some(runner) = ci_runner_by_token(db, token).await? else {
        return Ok(None);
    };
    Ok(Some(TokenPrincipal {
        user: format!("ci-runner:{}", runner.id),
    }))
}

pub async fn ci_runner_by_token(db: &Database, token: &str) -> Result<Option<CiRunner>> {
    ensure_ci_schema(db).await?;
    let hash = token_hash(token);
    let row: Option<CiRunnerRow> = db
        .prepare(
            "SELECT id, tenant, project, name, prefix, created_by, created_at, concurrency, last_seen_at, disabled_at
             FROM ci_runners
             WHERE token_hash = ?1",
        )
        .bind(&[js_str(&hash)])?
        .first(None)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    if row.disabled_at.is_some() {
        return Ok(None);
    }
    Ok(Some(ci_runner_from_row(row)))
}

pub async fn touch_ci_runner(
    db: &Database,
    runner_id: &str,
    min_interval_seconds: u64,
) -> Result<()> {
    ensure_ci_schema(db).await?;
    let now = now_rfc3339();
    let cutoff = rfc3339_seconds_ago(min_interval_seconds);
    db.prepare(
        "UPDATE ci_runners
         SET last_seen_at = ?1
         WHERE id = ?2 AND (last_seen_at IS NULL OR last_seen_at < ?3)",
    )
    .bind(&[js_str(&now), js_str(runner_id), js_str(&cutoff)])?
    .run()
    .await?;
    Ok(())
}

pub async fn ci_runner_allows(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: &str,
    capability: &str,
) -> Result<Option<bool>> {
    let Some(id) = principal.strip_prefix("ci-runner:") else {
        return Ok(None);
    };
    ensure_ci_schema(db).await?;
    let row: Option<CiRunnerRow> = db
        .prepare(
            "SELECT id, tenant, project, name, prefix, created_by, created_at, concurrency, last_seen_at, disabled_at
             FROM ci_runners
             WHERE id = ?1 AND tenant = ?2 AND project = ?3",
        )
        .bind(&[js_str(id), js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row
        .is_some_and(|row| {
            row.disabled_at.is_none()
                && matches!(
                    capability,
                    "main:read"
                        | "workspaces:read"
                        | "status_checks"
                        | "ci:write"
                        | "objects:read"
                        | "history:read"
                )
        })
        .then_some(true))
}

fn ci_runner_from_row(row: CiRunnerRow) -> CiRunner {
    CiRunner {
        id: row.id,
        tenant: row.tenant,
        project: row.project,
        name: row.name,
        prefix: row.prefix,
        created_by: row.created_by,
        created_at: row.created_at,
        concurrency: (row.concurrency as u32).clamp(1, 32),
        last_seen_at: row.last_seen_at,
        disabled_at: row.disabled_at,
        token: None,
    }
}
