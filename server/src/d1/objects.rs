use super::*;
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
