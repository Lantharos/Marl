use serde::Serialize;

use super::*;

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceCheck {
    pub id: String,
    pub workspace: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head: Option<String>,
    pub name: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conclusion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceCheckSummary {
    pub state: String,
    pub total: u64,
    pub passing: u64,
    pub failing: u64,
    pub pending: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuditEvent {
    pub id: String,
    pub actor: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub metadata: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Notification {
    pub id: String,
    pub tenant: String,
    pub project: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub href: String,
    pub read_at: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
struct CheckRow {
    id: String,
    workspace: String,
    head: Option<String>,
    name: String,
    status: String,
    conclusion: Option<String>,
    summary: Option<String>,
    details_url: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
struct CountRow {
    count: f64,
}

#[derive(Deserialize)]
struct AuditRow {
    id: String,
    actor: String,
    action: String,
    target_type: String,
    target_id: String,
    metadata_json: String,
    created_at: String,
}

#[derive(Deserialize)]
struct NotificationRow {
    id: String,
    tenant: String,
    project: String,
    kind: String,
    title: String,
    body: String,
    href: String,
    read_at: Option<String>,
    created_at: String,
}

pub async fn ensure_governance_schema(db: &Database) -> Result<()> {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS workspace_checks (
            id TEXT PRIMARY KEY,
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            workspace TEXT NOT NULL,
            head TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            conclusion TEXT,
            summary TEXT,
            details_url TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_checks_unique
         ON workspace_checks(tenant, project, workspace, head, name)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_workspace_checks_scope
         ON workspace_checks(tenant, project, workspace, head)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_project_time
         ON audit_log(tenant, project, created_at DESC)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user TEXT NOT NULL,
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            href TEXT NOT NULL,
            read_at TEXT,
            created_at TEXT NOT NULL
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_notifications_user_time
         ON notifications(user, read_at, created_at DESC)",
    )
    .run()
    .await?;
    Ok(())
}

pub async fn upsert_workspace_check(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
    name: &str,
    status: &str,
    conclusion: Option<&str>,
    summary: Option<&str>,
    details_url: Option<&str>,
) -> Result<WorkspaceCheck> {
    ensure_governance_schema(db).await?;
    let id = format!("check-{}", Uuid::new_v4().simple());
    let now = now_rfc3339();
    let head = head.unwrap_or_default();
    db.prepare(
        "INSERT INTO workspace_checks (id, tenant, project, workspace, head, name, status, conclusion, summary, details_url, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
         ON CONFLICT(tenant, project, workspace, head, name) DO UPDATE SET
             status = excluded.status,
             conclusion = excluded.conclusion,
             summary = excluded.summary,
             details_url = excluded.details_url,
             updated_at = excluded.updated_at",
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        js_str(workspace),
        js_str(head),
        js_str(name),
        js_str(status),
        js_opt(conclusion),
        js_opt(summary),
        js_opt(details_url),
        js_str(&now),
    ])?
    .run()
    .await?;
    list_workspace_checks(db, tenant, project, workspace, Some(head))
        .await?
        .into_iter()
        .find(|check| check.name == name)
        .ok_or_else(|| err("workspace check not found"))
}

pub async fn list_workspace_checks(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
) -> Result<Vec<WorkspaceCheck>> {
    ensure_governance_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, workspace, NULLIF(head, '') AS head, name, status, conclusion, summary, details_url, created_at, updated_at
             FROM workspace_checks
             WHERE tenant = ?1 AND project = ?2 AND workspace = ?3
               AND ((?4 IS NULL AND head = '') OR head = ?4)
             ORDER BY name",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace), js_opt(head)])?
        .all()
        .await?;
    let rows: Vec<CheckRow> = result.results()?;
    Ok(rows.into_iter().map(check_from_row).collect())
}

pub async fn workspace_check_summary(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
) -> Result<WorkspaceCheckSummary> {
    let checks = list_workspace_checks(db, tenant, project, workspace, head).await?;
    Ok(check_summary(&checks))
}

pub async fn unresolved_workspace_comment_count(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<u64> {
    let row: Option<CountRow> = db
        .prepare(
            "SELECT COUNT(*) AS count
             FROM protocol_items
             WHERE tenant = ?1 AND project = ?2 AND kind = 'comment'
               AND json_extract(data_json, '$.workspace') = ?3
               AND COALESCE(json_extract(data_json, '$.state'), 'open') != 'resolved'
               AND COALESCE(json_extract(data_json, '$.target_type'), '') IN ('file', 'line')",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .first(None)
        .await?;
    Ok(row.map(|row| row.count as u64).unwrap_or(0))
}

pub async fn set_workspace_mergeable(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    mergeable: bool,
) -> Result<()> {
    db.prepare(
        "UPDATE workspace_states SET mergeable = ?4 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(workspace),
        wasm_bindgen::JsValue::from_f64(if mergeable { 1.0 } else { 0.0 }),
    ])?
    .run()
    .await?;
    recompute_project_stats(db, tenant, project).await?;
    Ok(())
}

pub async fn record_audit_event(
    db: &Database,
    tenant: &str,
    project: &str,
    actor: &str,
    action: &str,
    target_type: &str,
    target_id: &str,
    metadata: serde_json::Value,
) -> Result<()> {
    ensure_governance_schema(db).await?;
    let id = format!("audit-{}", Uuid::new_v4().simple());
    let metadata_json = serde_json::to_string(&metadata).map_err(|error| err(error.to_string()))?;
    db.prepare(
        "INSERT INTO audit_log (id, tenant, project, actor, action, target_type, target_id, metadata_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        js_str(actor),
        js_str(action),
        js_str(target_type),
        js_str(target_id),
        js_str(&metadata_json),
        js_str(&now_rfc3339()),
    ])?
    .run()
    .await?;
    Ok(())
}

pub async fn list_audit_events(
    db: &Database,
    tenant: &str,
    project: &str,
    limit: u64,
) -> Result<Vec<AuditEvent>> {
    ensure_governance_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, actor, action, target_type, target_id, metadata_json, created_at
             FROM audit_log
             WHERE tenant = ?1 AND project = ?2
             ORDER BY created_at DESC
             LIMIT ?3",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<AuditRow> = result.results()?;
    Ok(rows.into_iter().map(audit_from_row).collect())
}

pub async fn create_notification(
    db: &Database,
    user: &str,
    tenant: &str,
    project: &str,
    kind: &str,
    title: &str,
    body: &str,
    href: &str,
) -> Result<()> {
    ensure_governance_schema(db).await?;
    let id = format!("notif-{}", Uuid::new_v4().simple());
    db.prepare(
        "INSERT INTO notifications (id, user, tenant, project, kind, title, body, href, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(&[
        js_str(&id),
        js_str(user),
        js_str(tenant),
        js_str(project),
        js_str(kind),
        js_str(title),
        js_str(body),
        js_str(href),
        js_str(&now_rfc3339()),
    ])?
    .run()
    .await?;
    Ok(())
}

pub async fn list_notifications(
    db: &Database,
    user: &str,
    limit: u64,
) -> Result<Vec<Notification>> {
    ensure_governance_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, tenant, project, kind, title, body, href, read_at, created_at
             FROM notifications
             WHERE user = ?1
             ORDER BY read_at IS NOT NULL, created_at DESC
             LIMIT ?2",
        )
        .bind(&[js_str(user), wasm_bindgen::JsValue::from_f64(limit as f64)])?
        .all()
        .await?;
    let rows: Vec<NotificationRow> = result.results()?;
    Ok(rows.into_iter().map(notification_from_row).collect())
}

pub async fn mark_notification_read(db: &Database, user: &str, id: &str) -> Result<bool> {
    ensure_governance_schema(db).await?;
    let result = db
        .prepare(
            "UPDATE notifications SET read_at = COALESCE(read_at, ?1) WHERE id = ?2 AND user = ?3",
        )
        .bind(&[js_str(&now_rfc3339()), js_str(id), js_str(user)])?
        .run()
        .await?;
    Ok(result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) > 0)
}

fn check_from_row(row: CheckRow) -> WorkspaceCheck {
    WorkspaceCheck {
        id: row.id,
        workspace: row.workspace,
        head: row.head,
        name: row.name,
        status: row.status,
        conclusion: row.conclusion,
        summary: row.summary,
        details_url: row.details_url,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn check_summary(checks: &[WorkspaceCheck]) -> WorkspaceCheckSummary {
    let mut summary = WorkspaceCheckSummary {
        state: "not_configured".to_string(),
        total: checks.len() as u64,
        passing: 0,
        failing: 0,
        pending: 0,
    };
    for check in checks {
        match (check.status.as_str(), check.conclusion.as_deref()) {
            ("completed", Some("success" | "skipped")) => summary.passing += 1,
            ("completed", _) => summary.failing += 1,
            _ => summary.pending += 1,
        }
    }
    summary.state = if checks.is_empty() {
        "not_configured".to_string()
    } else if summary.pending > 0 {
        "pending".to_string()
    } else if summary.failing > 0 {
        "failing".to_string()
    } else {
        "passing".to_string()
    };
    summary
}

fn audit_from_row(row: AuditRow) -> AuditEvent {
    AuditEvent {
        id: row.id,
        actor: row.actor,
        action: row.action,
        target_type: row.target_type,
        target_id: row.target_id,
        metadata: serde_json::from_str(&row.metadata_json)
            .unwrap_or_else(|_| serde_json::json!({})),
        created_at: row.created_at,
    }
}

fn notification_from_row(row: NotificationRow) -> Notification {
    Notification {
        id: row.id,
        tenant: row.tenant,
        project: row.project,
        kind: row.kind,
        title: row.title,
        body: row.body,
        href: row.href,
        read_at: row.read_at,
        created_at: row.created_at,
    }
}
