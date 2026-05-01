use super::*;

#[derive(Default)]
pub struct HistorySnapshotMetadata {
    pub agent: Option<String>,
    pub model: Option<String>,
    pub signature: Option<HistorySignature>,
}

#[derive(Deserialize)]
struct HistoryRow {
    id: String,
    kind: String,
    message: String,
    author: String,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    updated_at: Option<String>,
    timestamp: String,
    workspace: String,
    snapshot_id: Option<String>,
    agent: Option<String>,
    model: Option<String>,
    signature_json: Option<String>,
}

fn history_entry_from_row(row: HistoryRow) -> HistoryEntry {
    HistoryEntry {
        id: row.id,
        kind: row.kind,
        message: row.message,
        author_profile: user_profile_from_parts(
            &row.author,
            row.display_name,
            row.handle,
            row.avatar_url,
            row.email,
            row.updated_at,
        ),
        author: row.author,
        timestamp: row.timestamp,
        workspace: row.workspace,
        snapshot_id: row.snapshot_id,
        agent: row.agent,
        model: row.model,
        signature: row
            .signature_json
            .and_then(|value| serde_json::from_str(&value).ok()),
    }
}

pub async fn workspace_history_with_limit(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    limit: Option<usize>,
) -> Result<Vec<HistoryEntry>> {
    let result = if let Some(limit) = limit {
        db.prepare(
            "SELECT h.id, h.kind, h.message, h.author, u.display_name, u.handle, u.avatar_url, u.email, u.updated_at, \
             h.timestamp, h.workspace, h.snapshot_id, h.agent, h.model, h.signature_json FROM history h \
             LEFT JOIN user_profiles u ON u.user = h.author \
             WHERE h.tenant = ?1 AND h.project = ?2 AND h.workspace = ?3 \
             ORDER BY h.timestamp DESC LIMIT ?4",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(workspace),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?
    } else {
        db.prepare(
            "SELECT h.id, h.kind, h.message, h.author, u.display_name, u.handle, u.avatar_url, u.email, u.updated_at, \
             h.timestamp, h.workspace, h.snapshot_id, h.agent, h.model, h.signature_json FROM history h \
             LEFT JOIN user_profiles u ON u.user = h.author \
             WHERE h.tenant = ?1 AND h.project = ?2 AND h.workspace = ?3 \
             ORDER BY h.timestamp DESC",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .all()
        .await?
    };
    let rows: Vec<HistoryRow> = result.results()?;
    Ok(rows.into_iter().map(history_entry_from_row).collect())
}

pub async fn project_history(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<HistoryEntry>> {
    project_history_with_limit(db, tenant, project, None).await
}

pub async fn project_history_with_limit(
    db: &Database,
    tenant: &str,
    project: &str,
    limit: Option<usize>,
) -> Result<Vec<HistoryEntry>> {
    let result = if let Some(limit) = limit {
        db.prepare(
            "SELECT h.id, h.kind, h.message, h.author, u.display_name, u.handle, u.avatar_url, u.email, u.updated_at, \
             h.timestamp, h.workspace, h.snapshot_id, h.agent, h.model, h.signature_json FROM history h \
             LEFT JOIN user_profiles u ON u.user = h.author \
             WHERE h.tenant = ?1 AND h.project = ?2 \
             ORDER BY h.timestamp DESC LIMIT ?3"
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?
    } else {
        db.prepare(
            "SELECT h.id, h.kind, h.message, h.author, u.display_name, u.handle, u.avatar_url, u.email, u.updated_at, \
             h.timestamp, h.workspace, h.snapshot_id, h.agent, h.model, h.signature_json FROM history h \
             LEFT JOIN user_profiles u ON u.user = h.author \
             WHERE h.tenant = ?1 AND h.project = ?2 \
             ORDER BY h.timestamp DESC"
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?
    };
    let rows: Vec<HistoryRow> = result.results()?;
    Ok(rows.into_iter().map(history_entry_from_row).collect())
}

pub async fn log_history(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
    kind: &str,
    message: &str,
    snapshot_id: Option<&str>,
    metadata: Option<&HistorySnapshotMetadata>,
) -> Result<()> {
    let id = format!("{}-{}", kind, Uuid::new_v4().simple());
    let timestamp = now_rfc3339();
    let signature_json = metadata
        .and_then(|value| value.signature.as_ref())
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| err(error.to_string()))?;
    db.prepare(
        "INSERT INTO history (id, tenant, project, workspace, kind, message, author, timestamp, snapshot_id, agent, model, signature_json) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        js_str(workspace),
        js_str(kind),
        js_str(message),
        js_str(&principal.user),
        js_str(&timestamp),
        js_opt(snapshot_id),
        js_opt(metadata.and_then(|value| value.agent.as_deref())),
        js_opt(metadata.and_then(|value| value.model.as_deref())),
        js_opt(signature_json.as_deref()),
    ])?
    .run()
    .await?;
    recompute_project_stats(db, tenant, project).await?;
    Ok(())
}

pub async fn get_history_entry(
    db: &Database,
    tenant: &str,
    project: &str,
    entry_id: &str,
) -> Result<Option<HistoryEntry>> {
    let row: Option<HistoryRow> = db
        .prepare(
            "SELECT h.id, h.kind, h.message, h.author, u.display_name, u.handle, u.avatar_url, u.email, u.updated_at, \
             h.timestamp, h.workspace, h.snapshot_id, h.agent, h.model, h.signature_json FROM history h \
             LEFT JOIN user_profiles u ON u.user = h.author \
             WHERE h.tenant = ?1 AND h.project = ?2 AND h.id = ?3"
        )
        .bind(&[js_str(tenant), js_str(project), js_str(entry_id)])?
        .first(None)
        .await?;
    Ok(row.map(history_entry_from_row))
}

// -- Issues -----------------------------------------------
