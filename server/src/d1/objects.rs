use super::*;
pub async fn object_kind(
    db: &D1Database,
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

pub async fn record_object(
    db: &D1Database,
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

pub(super) async fn star_count(db: &D1Database, tenant: &str, project: &str) -> Result<u64> {
    #[derive(Deserialize)]
    struct CountRow {
        count: f64,
    }
    let row: Option<CountRow> = db
        .prepare("SELECT COUNT(*) AS count FROM stars WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|r| r.count as u64).unwrap_or(0))
}
