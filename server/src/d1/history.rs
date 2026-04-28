use super::*;
pub async fn workspace_history(
    db: &D1Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<Vec<HistoryEntry>> {
    #[derive(Deserialize)]
    struct Row {
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
    }
    let result = db
        .prepare(
            "SELECT h.id, h.kind, h.message, h.author, u.display_name, u.handle, u.avatar_url, u.email, u.updated_at, \
             h.timestamp, h.workspace, h.snapshot_id FROM history h \
             LEFT JOIN user_profiles u ON u.user = h.author \
             WHERE h.tenant = ?1 AND h.project = ?2 AND h.workspace = ?3 \
             ORDER BY h.timestamp DESC"
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| HistoryEntry {
            id: r.id,
            kind: r.kind,
            message: r.message,
            author_profile: profile_from_row(&r.author, r.display_name, r.handle, r.avatar_url, r.email, r.updated_at),
            author: r.author,
            timestamp: r.timestamp,
            workspace: r.workspace,
            snapshot_id: r.snapshot_id,
        })
        .collect())
}

pub async fn project_history(
    db: &D1Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<HistoryEntry>> {
    #[derive(Deserialize)]
    struct Row {
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
    }
    let result = db
        .prepare(
            "SELECT h.id, h.kind, h.message, h.author, u.display_name, u.handle, u.avatar_url, u.email, u.updated_at, \
             h.timestamp, h.workspace, h.snapshot_id FROM history h \
             LEFT JOIN user_profiles u ON u.user = h.author \
             WHERE h.tenant = ?1 AND h.project = ?2 \
             ORDER BY h.timestamp DESC"
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| HistoryEntry {
            id: r.id,
            kind: r.kind,
            message: r.message,
            author_profile: profile_from_row(&r.author, r.display_name, r.handle, r.avatar_url, r.email, r.updated_at),
            author: r.author,
            timestamp: r.timestamp,
            workspace: r.workspace,
            snapshot_id: r.snapshot_id,
        })
        .collect())
}

pub async fn log_history(
    db: &D1Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
    kind: &str,
    message: &str,
    snapshot_id: Option<&str>,
) -> Result<()> {
    let id = format!("{}-{}", kind, Uuid::new_v4().simple());
    let timestamp = now_rfc3339();
    db.prepare(
        "INSERT INTO history (id, tenant, project, workspace, kind, message, author, timestamp, snapshot_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
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
    ])?
    .run()
    .await?;
    Ok(())
}

pub async fn get_history_entry(
    db: &D1Database,
    tenant: &str,
    project: &str,
    entry_id: &str,
) -> Result<Option<HistoryEntry>> {
    #[derive(Deserialize)]
    struct Row {
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
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT h.id, h.kind, h.message, h.author, u.display_name, u.handle, u.avatar_url, u.email, u.updated_at, \
             h.timestamp, h.workspace, h.snapshot_id FROM history h \
             LEFT JOIN user_profiles u ON u.user = h.author \
             WHERE h.tenant = ?1 AND h.project = ?2 AND h.id = ?3"
        )
        .bind(&[js_str(tenant), js_str(project), js_str(entry_id)])?
        .first(None)
        .await?;
    Ok(row.map(|r| HistoryEntry {
        id: r.id,
        kind: r.kind,
        message: r.message,
        author_profile: profile_from_row(&r.author, r.display_name, r.handle, r.avatar_url, r.email, r.updated_at),
        author: r.author,
        timestamp: r.timestamp,
        workspace: r.workspace,
        snapshot_id: r.snapshot_id,
    }))
}

fn profile_from_row(
    user: &str,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    updated_at: Option<String>,
) -> Option<UserProfile> {
    display_name.map(|display_name| UserProfile {
        user: user.to_string(),
        display_name,
        handle,
        avatar_url,
        email,
        updated_at,
    })
}

// -- Issues -----------------------------------------------

