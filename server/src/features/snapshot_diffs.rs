use super::*;
use std::sync::atomic::{AtomicBool, Ordering};

static SNAPSHOT_DIFFS_READY: AtomicBool = AtomicBool::new(false);

async fn ensure_snapshot_diffs_table(db: &Database) -> Result<()> {
    if SNAPSHOT_DIFFS_READY.load(Ordering::Relaxed) {
        return Ok(());
    }
    db.prepare(
        "CREATE TABLE IF NOT EXISTS snapshot_diffs (
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            snapshot_id TEXT NOT NULL,
            base_snapshot_id TEXT NOT NULL,
            changed_paths_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (tenant, project, snapshot_id, base_snapshot_id)
        )",
    )
    .run()
    .await?;
    SNAPSHOT_DIFFS_READY.store(true, Ordering::Relaxed);
    Ok(())
}

pub async fn cached_changed_paths(
    db: &Database,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
    base_snapshot_id: &str,
) -> Result<Option<Vec<String>>> {
    ensure_snapshot_diffs_table(db).await?;
    #[derive(Deserialize)]
    struct Row {
        changed_paths_json: String,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT changed_paths_json FROM snapshot_diffs
             WHERE tenant = ?1 AND project = ?2 AND snapshot_id = ?3 AND base_snapshot_id = ?4",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(snapshot_id),
            js_str(base_snapshot_id),
        ])?
        .first(None)
        .await?;
    row.map(|row| {
        serde_json::from_str::<Vec<String>>(&row.changed_paths_json).map_err(|error| {
            err(format!("invalid snapshot diff cache: {error}"))
        })
    })
    .transpose()
}

pub async fn store_changed_paths(
    db: &Database,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
    base_snapshot_id: &str,
    changed_paths: &[String],
) -> Result<()> {
    ensure_snapshot_diffs_table(db).await?;
    let changed_paths_json = serde_json::to_string(changed_paths)
        .map_err(|error| err(error.to_string()))?;
    db.prepare(
        "INSERT INTO snapshot_diffs (tenant, project, snapshot_id, base_snapshot_id, changed_paths_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(tenant, project, snapshot_id, base_snapshot_id)
         DO UPDATE SET changed_paths_json = excluded.changed_paths_json, created_at = excluded.created_at",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(snapshot_id),
        js_str(base_snapshot_id),
        js_str(&changed_paths_json),
        js_str(&now_rfc3339()),
    ])?
    .run()
    .await?;
    Ok(())
}

const MAX_BLOB_MAP_CACHE_BYTES: usize = 4 * 1024 * 1024;

async fn ensure_snapshot_blob_maps_table(db: &Database) -> Result<()> {
    ensure_snapshot_diffs_table(db).await?;
    db.prepare(
        "CREATE TABLE IF NOT EXISTS snapshot_blob_maps (
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            snapshot_id TEXT NOT NULL,
            blob_map_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (tenant, project, snapshot_id)
        )",
    )
    .run()
    .await?;
    Ok(())
}

pub async fn cached_snapshot_blob_map(
    env: &worker::Env,
    db: &Database,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
) -> Result<std::collections::HashMap<String, String>> {
    ensure_snapshot_blob_maps_table(db).await?;
    #[derive(Deserialize)]
    struct Row {
        blob_map_json: String,
    }
    if let Some(row) = db
        .prepare(
            "SELECT blob_map_json FROM snapshot_blob_maps
             WHERE tenant = ?1 AND project = ?2 AND snapshot_id = ?3",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(snapshot_id),
        ])?
        .first::<Row>(None)
        .await?
    {
        if let Ok(map) =
            serde_json::from_str::<std::collections::HashMap<String, String>>(&row.blob_map_json)
        {
            return Ok(map);
        }
    }

    let map =
        crate::routes::graph::build_snapshot_blob_map(env, tenant, project, snapshot_id).await?;
    let blob_map_json =
        serde_json::to_string(&map).map_err(|error| err(error.to_string()))?;
    if blob_map_json.len() <= MAX_BLOB_MAP_CACHE_BYTES {
        db.prepare(
            "INSERT INTO snapshot_blob_maps (tenant, project, snapshot_id, blob_map_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(tenant, project, snapshot_id)
             DO UPDATE SET blob_map_json = excluded.blob_map_json, created_at = excluded.created_at",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(snapshot_id),
            js_str(&blob_map_json),
            js_str(&now_rfc3339()),
        ])?
        .run()
        .await?;
    }
    Ok(map)
}

pub async fn warm_snapshot_caches_for_history(
    env: &worker::Env,
    db: &Database,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
) -> Result<()> {
    let _ = cached_snapshot_blob_map(env, db, tenant, project, snapshot_id).await?;
    if let Some(parent) =
        crate::routes::sync::snapshot_parent(env, tenant, project, snapshot_id).await?
    {
        let _ = cached_snapshot_blob_map(env, db, tenant, project, &parent).await?;
        let _ = crate::routes::graph::changed_paths_with_cache(
            env,
            db,
            tenant,
            project,
            snapshot_id,
            &parent,
        )
        .await?;
    }
    Ok(())
}
