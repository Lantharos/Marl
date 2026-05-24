use super::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct CiArtifact {
    pub id: String,
    pub job_id: String,
    pub name: String,
    pub size: u64,
    pub digest: String,
    pub content_type: String,
    pub created_at: String,
    #[serde(skip_serializing)]
    pub storage_key: String,
}

#[derive(Debug, Clone)]
pub struct CiCacheRecord {
    pub cache_key: String,
    pub storage_key: String,
    pub format: String,
    pub size: u64,
    pub digest: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
struct CiArtifactRow {
    id: String,
    job_id: String,
    name: String,
    storage_key: String,
    size: f64,
    digest: String,
    content_type: String,
    created_at: String,
}

#[derive(Deserialize)]
struct CiCacheRow {
    cache_key: String,
    storage_key: String,
    format: String,
    size: f64,
    digest: String,
    updated_at: String,
}

pub(super) async fn ensure_ci_storage_schema(db: &Database) -> Result<()> {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS ci_artifacts (
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
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_ci_artifacts_job
         ON ci_artifacts(tenant, project, job_id, created_at DESC)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE TABLE IF NOT EXISTS ci_caches (
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            cache_key TEXT NOT NULL,
            storage_key TEXT NOT NULL,
            format TEXT NOT NULL DEFAULT 'raw',
            size INTEGER NOT NULL,
            digest TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (tenant, project, cache_key)
        )",
    )
    .run()
    .await?;
    Ok(())
}

pub async fn record_ci_artifact(
    db: &Database,
    job: &CiJob,
    name: &str,
    storage_key: &str,
    size: usize,
    digest: &str,
    content_type: &str,
) -> Result<CiArtifact> {
    ensure_ci_schema(db).await?;
    let id = format!("cia_{}", Uuid::new_v4().simple());
    let now = now_rfc3339();
    db.prepare(
        "INSERT INTO ci_artifacts
         (id, job_id, tenant, project, name, storage_key, size, digest, content_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    )
    .bind(&[
        js_str(&id),
        js_str(&job.id),
        js_str(&job.tenant),
        js_str(&job.project),
        js_str(name),
        js_str(storage_key),
        wasm_bindgen::JsValue::from_f64(size as f64),
        js_str(digest),
        js_str(content_type),
        js_str(&now),
    ])?
    .run()
    .await?;
    Ok(CiArtifact {
        id,
        job_id: job.id.clone(),
        name: name.to_string(),
        size: size as u64,
        digest: digest.to_string(),
        content_type: content_type.to_string(),
        created_at: now,
        storage_key: storage_key.to_string(),
    })
}

pub async fn list_ci_artifacts(
    db: &Database,
    tenant: &str,
    project: &str,
    job_id: &str,
) -> Result<Vec<CiArtifact>> {
    ensure_ci_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, job_id, name, storage_key, size, digest, content_type, created_at
             FROM ci_artifacts
             WHERE tenant = ?1 AND project = ?2 AND job_id = ?3
             ORDER BY created_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(job_id)])?
        .all()
        .await?;
    let rows: Vec<CiArtifactRow> = result.results()?;
    Ok(rows.into_iter().map(ci_artifact_from_row).collect())
}

pub async fn stale_ci_artifacts(
    db: &Database,
    tenant: &str,
    project: &str,
    cutoff: &str,
    limit: u64,
) -> Result<Vec<CiArtifact>> {
    ensure_ci_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, job_id, name, storage_key, size, digest, content_type, created_at
             FROM ci_artifacts
             WHERE tenant = ?1 AND project = ?2 AND created_at < ?3
             ORDER BY created_at ASC
             LIMIT ?4",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(cutoff),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<CiArtifactRow> = result.results()?;
    Ok(rows.into_iter().map(ci_artifact_from_row).collect())
}

pub async fn ci_artifact_by_id(
    db: &Database,
    tenant: &str,
    project: &str,
    job_id: &str,
    artifact_id: &str,
) -> Result<Option<CiArtifact>> {
    ensure_ci_schema(db).await?;
    let row: Option<CiArtifactRow> = db
        .prepare(
            "SELECT id, job_id, name, storage_key, size, digest, content_type, created_at
             FROM ci_artifacts
             WHERE tenant = ?1 AND project = ?2 AND job_id = ?3 AND id = ?4",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(job_id),
            js_str(artifact_id),
        ])?
        .first(None)
        .await?;
    Ok(row.map(ci_artifact_from_row))
}

pub async fn delete_ci_artifact(
    db: &Database,
    tenant: &str,
    project: &str,
    artifact_id: &str,
) -> Result<()> {
    ensure_ci_schema(db).await?;
    db.prepare("DELETE FROM ci_artifacts WHERE tenant = ?1 AND project = ?2 AND id = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(artifact_id)])?
        .run()
        .await?;
    Ok(())
}

pub async fn upsert_ci_cache(
    db: &Database,
    tenant: &str,
    project: &str,
    cache_key: &str,
    storage_key: &str,
    format: &str,
    size: usize,
    digest: &str,
) -> Result<CiCacheRecord> {
    ensure_ci_schema(db).await?;
    let now = now_rfc3339();
    db.prepare(
        "INSERT INTO ci_caches (tenant, project, cache_key, storage_key, format, size, digest, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(tenant, project, cache_key) DO UPDATE SET
             storage_key = excluded.storage_key,
             format = excluded.format,
             size = excluded.size,
             digest = excluded.digest,
             updated_at = excluded.updated_at",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(cache_key),
        js_str(storage_key),
        js_str(format),
        wasm_bindgen::JsValue::from_f64(size as f64),
        js_str(digest),
        js_str(&now),
    ])?
    .run()
    .await?;
    Ok(CiCacheRecord {
        cache_key: cache_key.to_string(),
        storage_key: storage_key.to_string(),
        format: format.to_string(),
        size: size as u64,
        digest: digest.to_string(),
        updated_at: now,
    })
}

pub async fn ci_cache_by_key(
    db: &Database,
    tenant: &str,
    project: &str,
    cache_key: &str,
) -> Result<Option<CiCacheRecord>> {
    ensure_ci_schema(db).await?;
    let row: Option<CiCacheRow> = db
        .prepare(
            "SELECT cache_key, storage_key, format, size, digest, updated_at
             FROM ci_caches
             WHERE tenant = ?1 AND project = ?2 AND cache_key = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(cache_key)])?
        .first(None)
        .await?;
    Ok(row.map(ci_cache_from_row))
}

pub async fn stale_ci_caches(
    db: &Database,
    tenant: &str,
    project: &str,
    cutoff: &str,
    limit: u64,
) -> Result<Vec<CiCacheRecord>> {
    ensure_ci_schema(db).await?;
    let result = db
        .prepare(
            "SELECT cache_key, storage_key, format, size, digest, updated_at
             FROM ci_caches
             WHERE tenant = ?1 AND project = ?2 AND updated_at < ?3
             ORDER BY updated_at ASC
             LIMIT ?4",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(cutoff),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<CiCacheRow> = result.results()?;
    Ok(rows.into_iter().map(ci_cache_from_row).collect())
}

pub async fn delete_ci_cache(
    db: &Database,
    tenant: &str,
    project: &str,
    cache_key: &str,
) -> Result<()> {
    ensure_ci_schema(db).await?;
    db.prepare("DELETE FROM ci_caches WHERE tenant = ?1 AND project = ?2 AND cache_key = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(cache_key)])?
        .run()
        .await?;
    Ok(())
}

fn ci_artifact_from_row(row: CiArtifactRow) -> CiArtifact {
    CiArtifact {
        id: row.id,
        job_id: row.job_id,
        name: row.name,
        size: row.size as u64,
        digest: row.digest,
        content_type: row.content_type,
        created_at: row.created_at,
        storage_key: row.storage_key,
    }
}

fn ci_cache_from_row(row: CiCacheRow) -> CiCacheRecord {
    CiCacheRecord {
        cache_key: row.cache_key,
        storage_key: row.storage_key,
        format: row.format,
        size: row.size as u64,
        digest: row.digest,
        updated_at: row.updated_at,
    }
}
