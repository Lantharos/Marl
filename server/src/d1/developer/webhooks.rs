use super::*;

pub async fn create_project_webhook(
    db: &Database,
    tenant: &str,
    project: &str,
    user: &str,
    name: &str,
    url: &str,
    events: &[String],
) -> Result<ProjectWebhook> {
    ensure_developer_schema(db).await?;
    let id = format!("wh_{}", Uuid::new_v4().simple());
    let now = now_rfc3339();
    let events = normalize_events(events);
    let events_json = serde_json::to_string(&events).map_err(|e| err(e.to_string()))?;
    let secret = new_token("sty_whsec");
    db.prepare(
        "INSERT INTO project_webhooks
         (id, tenant, project, name, url, events_json, secret, created_by, created_at, updated_at, last_delivery_at, last_delivery_status, active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, NULL, NULL, 1)",
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        js_str(name.trim()),
        js_str(url.trim()),
        js_str(&events_json),
        js_str(&secret),
        js_str(user),
        js_str(&now),
    ])?
    .run()
    .await?;
    Ok(ProjectWebhook {
        id,
        tenant: tenant.to_string(),
        project: project.to_string(),
        name: name.trim().to_string(),
        url: url.trim().to_string(),
        events,
        created_by: user.to_string(),
        created_at: now.clone(),
        updated_at: now,
        last_delivery_at: None,
        last_delivery_status: None,
        active: true,
        secret: Some(secret),
    })
}

pub async fn active_project_webhook_count(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<u32> {
    ensure_developer_schema(db).await?;
    #[derive(Deserialize)]
    struct Row {
        count: f64,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT COUNT(*) AS count
             FROM project_webhooks
             WHERE tenant = ?1 AND project = ?2 AND active = 1",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|row| row.count as u32).unwrap_or(0))
}

pub async fn list_project_webhooks(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<ProjectWebhook>> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, tenant, project, name, url, events_json, NULL AS secret, created_by, created_at, updated_at, last_delivery_at, last_delivery_status, active
             FROM project_webhooks
             WHERE tenant = ?1 AND project = ?2 AND active = 1
             ORDER BY created_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<WebhookRow> = result.results()?;
    Ok(rows.into_iter().map(webhook_from_row).collect())
}

pub async fn active_project_webhooks(
    db: &Database,
    tenant: &str,
    project: &str,
    event: &str,
) -> Result<Vec<ProjectWebhook>> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, tenant, project, name, url, events_json, secret, created_by, created_at, updated_at, last_delivery_at, last_delivery_status, active
             FROM project_webhooks
             WHERE tenant = ?1 AND project = ?2 AND active = 1
             ORDER BY created_at DESC
             LIMIT 20",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<WebhookRow> = result.results()?;
    Ok(rows
        .into_iter()
        .map(webhook_from_row)
        .filter(|hook| hook.events.iter().any(|item| item == "*" || item == event))
        .collect())
}

pub async fn project_webhook_by_id(
    db: &Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<Option<ProjectWebhook>> {
    ensure_developer_schema(db).await?;
    let row: Option<WebhookRow> = db
        .prepare(
            "SELECT id, tenant, project, name, url, events_json, secret, created_by, created_at, updated_at, last_delivery_at, last_delivery_status, active
             FROM project_webhooks
             WHERE tenant = ?1 AND project = ?2 AND id = ?3 AND active = 1",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(id)])?
        .first(None)
        .await?;
    Ok(row.map(webhook_from_row))
}

pub async fn revoke_project_webhook(
    db: &Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<bool> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "UPDATE project_webhooks SET active = 0, updated_at = ?1 WHERE tenant = ?2 AND project = ?3 AND id = ?4 AND active = 1",
        )
        .bind(&[js_str(&now_rfc3339()), js_str(tenant), js_str(project), js_str(id)])?
        .run()
        .await?;
    Ok(result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) > 0)
}

pub async fn record_webhook_delivery(
    db: &Database,
    tenant: &str,
    project: &str,
    id: &str,
    delivery_id: &str,
    event: &str,
    status: i64,
    payload_hash: &str,
    last_error: Option<&str>,
) -> Result<()> {
    ensure_developer_schema(db).await?;
    let now = now_rfc3339();
    db.prepare(
        "UPDATE project_webhooks SET last_delivery_at = ?1, last_delivery_status = ?2, updated_at = ?1 WHERE tenant = ?3 AND project = ?4 AND id = ?5",
    )
    .bind(&[
        js_str(&now),
        wasm_bindgen::JsValue::from_f64(status as f64),
        js_str(tenant),
        js_str(project),
        js_str(id),
    ])?
    .run()
    .await?;
    db.prepare(
        "INSERT INTO project_webhook_deliveries
         (delivery_id, hook_id, tenant, project, event, status, attempts, last_error, payload_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?9)
         ON CONFLICT(delivery_id) DO UPDATE SET
             status = excluded.status,
             attempts = project_webhook_deliveries.attempts + 1,
             last_error = excluded.last_error,
             updated_at = excluded.updated_at",
    )
    .bind(&[
        js_str(delivery_id),
        js_str(id),
        js_str(tenant),
        js_str(project),
        js_str(event),
        wasm_bindgen::JsValue::from_f64(status as f64),
        js_opt(last_error),
        js_str(payload_hash),
        js_str(&now),
    ])?
    .run()
    .await?;
    Ok(())
}

pub async fn webhook_delivery_succeeded(db: &Database, delivery_id: &str) -> Result<bool> {
    ensure_developer_schema(db).await?;
    #[derive(Deserialize)]
    struct Row {
        status: f64,
    }
    let row: Option<Row> = db
        .prepare("SELECT status FROM project_webhook_deliveries WHERE delivery_id = ?1")
        .bind(&[js_str(delivery_id)])?
        .first(None)
        .await?;
    Ok(row.is_some_and(|row| (200.0..300.0).contains(&row.status)))
}

pub async fn list_project_webhook_deliveries(
    db: &Database,
    tenant: &str,
    project: &str,
    hook_id: &str,
    limit: u64,
) -> Result<Vec<ProjectWebhookDelivery>> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "SELECT delivery_id, hook_id, event, status, attempts, last_error, payload_hash, created_at, updated_at
             FROM project_webhook_deliveries
             WHERE tenant = ?1 AND project = ?2 AND hook_id = ?3
             ORDER BY updated_at DESC
             LIMIT ?4",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(hook_id),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<WebhookDeliveryRow> = result.results()?;
    Ok(rows.into_iter().map(webhook_delivery_from_row).collect())
}
