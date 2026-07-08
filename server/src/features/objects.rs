use super::*;
use std::collections::BTreeMap;

use crate::support::{bucket, infer_object_kind_from_bytes, object_key, r2_bytes};

const OBJECT_KIND_LOOKUP_BATCH: usize = 98;
pub async fn object_kind(
    db: &Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        kind: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT kind FROM object_index WHERE tenant = ?1 AND project = ?2 AND id = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(id)])?
        .first(None)
        .await?;
    Ok(row.map(|r| r.kind))
}

pub async fn object_kind_resolved(
    env: &Env,
    db: &Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<Option<String>> {
    if let Some(kind) = object_kind(db, tenant, project, id).await? {
        return Ok(Some(kind));
    }
    let storage = bucket(env)?;
    let bytes = match r2_bytes(&storage, &object_key(tenant, project, id)).await {
        Ok(bytes) => bytes,
        Err(_) => return Ok(None),
    };
    let kind = infer_object_kind_from_bytes(&bytes)?;
    let _ = record_object(db, tenant, project, id, &kind, bytes.len()).await;
    Ok(Some(kind))
}

pub async fn object_ids_by_kind(
    db: &Database,
    tenant: &str,
    project: &str,
    kind: &str,
) -> Result<Vec<String>> {
    #[derive(Deserialize)]
    struct Row {
        id: String,
    }
    let result = db
        .prepare(
            "SELECT id FROM object_index WHERE tenant = ?1 AND project = ?2 AND kind = ?3 ORDER BY created_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(kind)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows.into_iter().map(|row| row.id).collect())
}

pub async fn object_kinds(
    db: &Database,
    tenant: &str,
    project: &str,
    ids: &[String],
) -> Result<BTreeMap<String, String>> {
    if ids.is_empty() {
        return Ok(BTreeMap::new());
    }
    #[derive(Deserialize)]
    struct Row {
        id: String,
        kind: String,
    }
    let mut kinds = BTreeMap::new();
    for chunk in ids.chunks(OBJECT_KIND_LOOKUP_BATCH) {
        let placeholders = (0..chunk.len())
            .map(|index| format!("?{}", index + 3))
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "SELECT id, kind FROM object_index WHERE tenant = ?1 AND project = ?2 AND id IN ({placeholders})"
        );
        let mut bindings = Vec::with_capacity(chunk.len() + 2);
        bindings.push(js_str(tenant));
        bindings.push(js_str(project));
        bindings.extend(chunk.iter().map(|id| js_str(id)));
        let result = db.prepare(&query).bind(&bindings)?.all().await?;
        let rows: Vec<Row> = result.results()?;
        kinds.extend(rows.into_iter().map(|row| (row.id, row.kind)));
    }
    Ok(kinds)
}

pub async fn record_object(
    db: &Database,
    tenant: &str,
    project: &str,
    id: &str,
    kind: &str,
    size: usize,
) -> Result<()> {
    db.prepare(
        "INSERT INTO object_index (tenant, project, id, kind, size, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(tenant, project, id) DO UPDATE SET kind = excluded.kind, size = excluded.size",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(id),
        js_str(kind),
        wasm_bindgen::JsValue::from_f64(size as f64),
        js_str(&now_rfc3339()),
    ])?
    .run()
    .await?;
    Ok(())
}
