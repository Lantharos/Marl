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
        .filter(|hook| {
            hook.events.iter().any(|item| {
                item == "*"
                    || item == event
                    || (event == "snapshot.packed" && item == "snapshot.crammed")
            })
        })
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
    status: i64,
) -> Result<()> {
    ensure_developer_schema(db).await?;
    db.prepare(
        "UPDATE project_webhooks SET last_delivery_at = ?1, last_delivery_status = ?2, updated_at = ?1 WHERE tenant = ?3 AND project = ?4 AND id = ?5",
    )
    .bind(&[
        js_str(&now_rfc3339()),
        wasm_bindgen::JsValue::from_f64(status as f64),
        js_str(tenant),
        js_str(project),
        js_str(id),
    ])?
    .run()
    .await?;
    Ok(())
}
