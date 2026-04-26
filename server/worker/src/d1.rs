use serde::Deserialize;
use sha2::{Digest, Sha256};
use sty_protocol::{
    Comment, HistoryEntry, Issue, ProjectSettings, ProjectSummary, TenantSummary, TokenPrincipal,
    WorkspaceState,
};
use uuid::Uuid;
use worker::*;
use worker::D1Database;

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn err(msg: impl Into<String>) -> Error {
    Error::RustError(msg.into())
}

fn js_str(s: &str) -> wasm_bindgen::JsValue {
    wasm_bindgen::JsValue::from_str(s)
}

fn js_opt(s: Option<&str>) -> wasm_bindgen::JsValue {
    match s {
        Some(v) => wasm_bindgen::JsValue::from_str(v),
        None => wasm_bindgen::JsValue::NULL,
    }
}

fn now_rfc3339() -> String {
    let d = js_sys::Date::new_0();
    d.to_iso_string().into()
}

// ── Auth ─────────────────────────────────────────────────

pub async fn add_token(db: &D1Database, user: &str) -> Result<String> {
    let token = format!("sty_dev_{}", Uuid::new_v4().simple());
    let hash = token_hash(&token);
    db.prepare("INSERT INTO tokens (token_hash, user) VALUES (?1, ?2)")
        .bind(&[js_str(&hash), js_str(user)])?
        .run()
        .await?;
    Ok(token)
}

pub async fn principal_for_token(db: &D1Database, token: &str) -> Result<Option<TokenPrincipal>> {
    let hash = token_hash(token);
    #[derive(Deserialize)]
    struct Row {
        user: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT user FROM tokens WHERE token_hash = ?1")
        .bind(&[js_str(&hash)])?
        .first(None)
        .await?;
    Ok(row.map(|r| TokenPrincipal { user: r.user }))
}

// ── Tenants / Projects ───────────────────────────────────

pub async fn ensure_project(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    let members = serde_json::to_string(&vec![principal.user.clone()]).map_err(|e| err(e.to_string()))?;

    db.prepare("INSERT OR IGNORE INTO tenants (name, kind, owner, members_json) VALUES (?1, 'user', ?2, ?3)")
        .bind(&[js_str(&principal.user), js_str(&principal.user), js_str(&members)])?
        .run()
        .await?;

    db.prepare("INSERT OR IGNORE INTO tenants (name, kind, owner, members_json) VALUES (?1, 'user', ?2, ?3)")
        .bind(&[js_str(tenant), js_str(&principal.user), js_str(&members)])?
        .run()
        .await?;

    #[derive(Deserialize)]
    struct OwnerRow {
        owner: String,
    }
    let existing: Option<OwnerRow> = db
        .prepare("SELECT owner FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;

    if let Some(existing) = existing {
        if existing.owner != principal.user {
            let has_access = tenant_access(db, tenant, &principal.user).await?;
            if !has_access {
                return Err(err("project access denied"));
            }
        }
        return Ok(());
    }

    let settings = serde_json::to_string(&ProjectSettings {
        visibility: "private".to_string(),
        starred_count: 0,
        is_starred: false,
        default_workspace: "main".to_string(),
    }).map_err(|e| err(e.to_string()))?;
    db.prepare("INSERT INTO projects (tenant, project, owner, settings_json) VALUES (?1, ?2, ?3, ?4)")
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user), js_str(&settings)])?
        .run()
        .await?;

    Ok(())
}

pub async fn get_project(db: &D1Database, tenant: &str, project: &str) -> Result<Option<ProjectSummary>> {
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
        owner: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT tenant, project, owner FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|r| ProjectSummary {
        tenant: r.tenant,
        project: r.project,
        owner: r.owner,
    }))
}

pub async fn projects(db: &D1Database, _principal: &TokenPrincipal) -> Result<Vec<ProjectSummary>> {
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
        owner: String,
    }
    let result = db
        .prepare("SELECT tenant, project, owner FROM projects ORDER BY tenant, project")
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| ProjectSummary {
            tenant: r.tenant,
            project: r.project,
            owner: r.owner,
        })
        .collect())
}

pub async fn tenants(db: &D1Database, principal: &TokenPrincipal) -> Result<Vec<TenantSummary>> {
    #[derive(Deserialize)]
    struct Row {
        name: String,
        kind: String,
        owner: String,
    }
    let result = db
        .prepare("SELECT name, kind, owner FROM tenants WHERE owner = ?1 OR members_json LIKE ?2 ORDER BY name")
        .bind(&[js_str(&principal.user), js_str(&format!("%\"{}\"%", principal.user))])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| TenantSummary {
            name: r.name,
            kind: r.kind,
            owner: r.owner,
        })
        .collect())
}

pub async fn create_org(db: &D1Database, name: &str, principal: &TokenPrincipal) -> Result<TenantSummary> {
    let members = serde_json::to_string(&vec![principal.user.clone()]).map_err(|e| err(e.to_string()))?;
    db.prepare("INSERT OR IGNORE INTO tenants (name, kind, owner, members_json) VALUES (?1, 'org', ?2, ?3)")
        .bind(&[js_str(name), js_str(&principal.user), js_str(&members)])?
        .run()
        .await?;
    Ok(TenantSummary {
        name: name.to_string(),
        kind: "org".to_string(),
        owner: principal.user.clone(),
    })
}

pub async fn tenant_access(db: &D1Database, tenant: &str, user: &str) -> Result<bool> {
    if tenant == user {
        let members = serde_json::to_string(&vec![user.to_string()]).map_err(|e| err(e.to_string()))?;
        db.prepare("INSERT OR IGNORE INTO tenants (name, kind, owner, members_json) VALUES (?1, 'user', ?2, ?3)")
            .bind(&[js_str(user), js_str(user), js_str(&members)])?
            .run()
            .await?;
        return Ok(true);
    }
    #[derive(Deserialize)]
    struct Row {
        members_json: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT members_json FROM tenants WHERE name = ?1")
        .bind(&[js_str(tenant)])?
        .first(None)
        .await?;
    Ok(match row {
        Some(r) => {
            let members: Vec<String> = serde_json::from_str(&r.members_json).unwrap_or_default();
            members.iter().any(|m| m == user)
        }
        None => false,
    })
}

// ── Workspace heads ──────────────────────────────────────

pub async fn head(db: &D1Database, tenant: &str, project: &str, workspace: &str) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        head: Option<String>,
    }
    let row: Option<Row> = db
        .prepare("SELECT head FROM workspace_heads WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .first(None)
        .await?;
    Ok(row.and_then(|r| r.head))
}

pub async fn update_head(
    db: &D1Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    expected_head: Option<&str>,
    new_head: &str,
) -> Result<bool> {
    #[derive(Deserialize)]
    struct Row {
        head: Option<String>,
    }
    let current: Option<Row> = db
        .prepare("SELECT head FROM workspace_heads WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .first(None)
        .await?;

    if current.as_ref().and_then(|r| r.head.as_deref()) != expected_head {
        return Ok(false);
    }

    db.prepare(
        "INSERT INTO workspace_heads (tenant, project, workspace, head) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(tenant, project, workspace) DO UPDATE SET head = excluded.head"
    )
    .bind(&[js_str(tenant), js_str(project), js_str(workspace), js_str(new_head)])?
    .run()
    .await?;

    db.prepare(
        "INSERT INTO workspace_states (tenant, project, workspace, status, is_ready, parent_workspace, mergeable) \
         VALUES (?1, ?2, ?3, 'active', 0, NULL, 0) \
         ON CONFLICT(tenant, project, workspace) DO NOTHING"
    )
    .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
    .run()
    .await?;

    Ok(true)
}

// ── Workspace state ──────────────────────────────────────

pub async fn workspace_states(db: &D1Database, tenant: &str, project: &str) -> Result<Vec<WorkspaceState>> {
    #[derive(Deserialize)]
    struct Row {
        workspace: String,
        status: String,
        head: Option<String>,
        parent_workspace: Option<String>,
        is_ready: i64,
        mergeable: i64,
    }
    let result = db
        .prepare(
            "SELECT ws.workspace, ws.status, wh.head, ws.parent_workspace, ws.is_ready, ws.mergeable \
             FROM workspace_states ws \
             LEFT JOIN workspace_heads wh ON wh.tenant = ws.tenant AND wh.project = ws.project AND wh.workspace = ws.workspace \
             WHERE ws.tenant = ?1 AND ws.project = ?2 \
             ORDER BY ws.workspace"
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    let mut states: Vec<WorkspaceState> = rows
        .into_iter()
        .map(|r| WorkspaceState {
            name: r.workspace.clone(),
            status: r.status,
            head: r.head,
            parent_workspace: r.parent_workspace.clone(),
            child_workspaces: Vec::new(),
            is_ready: r.is_ready != 0,
            mergeable: r.mergeable != 0,
        })
        .collect();
    let mut parents = std::collections::HashMap::new();
    for ws in &states {
        if let Some(ref p) = ws.parent_workspace {
            parents.entry(p.clone()).or_insert_with(Vec::new).push(ws.name.clone());
        }
    }
    for ws in &mut states {
        ws.child_workspaces = parents.get(&ws.name).cloned().unwrap_or_default();
    }
    Ok(states)
}

pub async fn set_parent_workspace(
    db: &D1Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    parent: Option<&str>,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET parent_workspace = ?1 WHERE tenant = ?2 AND project = ?3 AND workspace = ?4")
        .bind(&[js_opt(parent), js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    Ok(())
}

pub async fn mark_workspace_ready(
    db: &D1Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET status = 'ready', is_ready = 1 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    log_history(db, tenant, project, workspace, principal, "ready", &format!("{} marked workspace {} as ready", principal.user, workspace), None).await?;
    Ok(())
}

pub async fn merge_workspace(
    db: &D1Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET status = 'merged', is_ready = 0 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    log_history(db, tenant, project, workspace, principal, "merge", &format!("{} merged workspace {}", principal.user, workspace), None).await?;
    Ok(())
}

// ── History ──────────────────────────────────────────────

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
        timestamp: String,
        workspace: String,
        snapshot_id: Option<String>,
    }
    let result = db
        .prepare(
            "SELECT id, kind, message, author, timestamp, workspace, snapshot_id FROM history \
             WHERE tenant = ?1 AND project = ?2 AND workspace = ?3 \
             ORDER BY timestamp DESC"
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
        timestamp: String,
        workspace: String,
        snapshot_id: Option<String>,
    }
    let result = db
        .prepare(
            "SELECT id, kind, message, author, timestamp, workspace, snapshot_id FROM history \
             WHERE tenant = ?1 AND project = ?2 \
             ORDER BY timestamp DESC"
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
        timestamp: String,
        workspace: String,
        snapshot_id: Option<String>,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT id, kind, message, author, timestamp, workspace, snapshot_id FROM history \
             WHERE tenant = ?1 AND project = ?2 AND id = ?3"
        )
        .bind(&[js_str(tenant), js_str(project), js_str(entry_id)])?
        .first(None)
        .await?;
    Ok(row.map(|r| HistoryEntry {
        id: r.id,
        kind: r.kind,
        message: r.message,
        author: r.author,
        timestamp: r.timestamp,
        workspace: r.workspace,
        snapshot_id: r.snapshot_id,
    }))
}

// ── Issues ───────────────────────────────────────────────

pub async fn list_issues(db: &D1Database, tenant: &str, project: &str) -> Result<Vec<Issue>> {
    #[derive(Deserialize)]
    struct Row {
        id: String,
        number: f64,
        title: String,
        body: String,
        status: String,
        author: String,
        created_at: String,
        labels_json: String,
    }
    let result = db
        .prepare(
            "SELECT id, number, title, body, status, author, created_at, labels_json FROM issues \
             WHERE tenant = ?1 AND project = ?2 ORDER BY number DESC"
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| Issue {
            id: r.id,
            number: r.number as u64,
            title: r.title,
            body: r.body,
            status: r.status,
            author: r.author,
            created_at: r.created_at,
            labels: serde_json::from_str(&r.labels_json).unwrap_or_default(),
        })
        .collect())
}

pub async fn create_issue(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
    title: &str,
    body: &str,
) -> Result<Issue> {
    #[derive(Deserialize)]
    struct CountRow {
        count: f64,
    }
    let count_row: Option<CountRow> = db
        .prepare("SELECT COALESCE(MAX(number), 0) + 1 AS count FROM issues WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    let next_number = count_row.map(|r| r.count as u64).unwrap_or(1);

    let id = format!("issue-{}", next_number);
    let created_at = now_rfc3339();
    let labels = serde_json::to_string(&Vec::<String>::new()).map_err(|e| err(e.to_string()))?;

    db.prepare(
        "INSERT INTO issues (id, tenant, project, number, title, body, status, author, created_at, labels_json) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?8, ?9)"
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        wasm_bindgen::JsValue::from_f64(next_number as f64),
        js_str(title),
        js_str(body),
        js_str(&principal.user),
        js_str(&created_at),
        js_str(&labels),
    ])?
    .run()
    .await?;

    Ok(Issue {
        id,
        number: next_number,
        title: title.to_string(),
        body: body.to_string(),
        status: "open".to_string(),
        author: principal.user.clone(),
        created_at,
        labels: Vec::new(),
    })
}

pub async fn update_issue_status(
    db: &D1Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    status: &str,
) -> Result<Issue> {
    db.prepare(
        "UPDATE issues SET status = ?1 WHERE tenant = ?2 AND project = ?3 AND id = ?4"
    )
    .bind(&[js_str(status), js_str(tenant), js_str(project), js_str(issue_id)])?
    .run()
    .await?;

    #[derive(Deserialize)]
    struct Row {
        id: String,
        number: f64,
        title: String,
        body: String,
        status: String,
        author: String,
        created_at: String,
        labels_json: String,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT id, number, title, body, status, author, created_at, labels_json FROM issues \
             WHERE tenant = ?1 AND project = ?2 AND id = ?3"
        )
        .bind(&[js_str(tenant), js_str(project), js_str(issue_id)])?
        .first(None)
        .await?;
    let row = row.ok_or_else(|| err("issue not found"))?;
    let labels = serde_json::from_str(&row.labels_json).unwrap_or_default();
    Ok(Issue {
        id: row.id,
        number: row.number as u64,
        title: row.title,
        body: row.body,
        status: row.status,
        author: row.author,
        created_at: row.created_at,
        labels,
    })
}

// ── Comments ─────────────────────────────────────────────

pub async fn list_comments(db: &D1Database, tenant: &str, project: &str, issue_id: &str) -> Result<Vec<Comment>> {
    #[derive(Deserialize)]
    struct Row {
        id: String,
        issue_id: String,
        author: String,
        body: String,
        created_at: String,
    }
    let result = db
        .prepare(
            "SELECT id, issue_id, author, body, created_at FROM comments \
             WHERE tenant = ?1 AND project = ?2 AND issue_id = ?3 \
             ORDER BY created_at"
        )
        .bind(&[js_str(tenant), js_str(project), js_str(issue_id)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| Comment {
            id: r.id,
            issue_id: r.issue_id,
            author: r.author,
            body: r.body,
            created_at: r.created_at,
        })
        .collect())
}

pub async fn create_comment(
    db: &D1Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    principal: &TokenPrincipal,
    body: &str,
) -> Result<Comment> {
    let id = format!("comment-{}", Uuid::new_v4().simple());
    let created_at = now_rfc3339();
    db.prepare(
        "INSERT INTO comments (id, tenant, project, issue_id, author, body, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        js_str(issue_id),
        js_str(&principal.user),
        js_str(body),
        js_str(&created_at),
    ])?
    .run()
    .await?;
    Ok(Comment {
        id,
        issue_id: issue_id.to_string(),
        author: principal.user.clone(),
        body: body.to_string(),
        created_at,
    })
}

// ── Settings / Stars ─────────────────────────────────────

pub async fn project_visibility(db: &D1Database, tenant: &str, project: &str) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        settings_json: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT settings_json FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    let visibility = row.map(|r| {
        serde_json::from_str::<ProjectSettings>(&r.settings_json)
            .map(|s| s.visibility)
            .unwrap_or_else(|_| "private".to_string())
    });
    Ok(visibility)
}

pub async fn project_settings(db: &D1Database, tenant: &str, project: &str, principal: &TokenPrincipal) -> Result<ProjectSettings> {
    #[derive(Deserialize)]
    struct Row {
        settings_json: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT settings_json FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;

    let settings_json = match row {
        Some(r) => r.settings_json,
        None => {
            return Ok(ProjectSettings {
                visibility: "private".to_string(),
                starred_count: 0,
                is_starred: false,
                default_workspace: "main".to_string(),
            })
        }
    };

    let mut settings: ProjectSettings = serde_json::from_str(&settings_json).map_err(|e| err(e.to_string()))?;

    #[derive(Deserialize)]
    struct CountRow {
        count: f64,
    }
    let count_row: Option<CountRow> = db
        .prepare("SELECT COUNT(*) AS count FROM stars WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    settings.starred_count = count_row.map(|r| r.count as u64).unwrap_or(0);
    settings.is_starred = is_starred(db, tenant, project, principal).await?;

    Ok(settings)
}

pub async fn update_project_settings(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
    visibility: &str,
    default_workspace: &str,
) -> Result<ProjectSettings> {
    let mut settings = project_settings(db, tenant, project, principal).await?;
    settings.visibility = visibility.to_string();
    settings.default_workspace = default_workspace.to_string();
    let json = serde_json::to_string(&settings).map_err(|e| err(e.to_string()))?;
    db.prepare("UPDATE projects SET settings_json = ?1 WHERE tenant = ?2 AND project = ?3")
        .bind(&[js_str(&json), js_str(tenant), js_str(project)])?
        .run()
        .await?;
    Ok(settings)
}

pub async fn star_project(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<(bool, u64)> {
    db.prepare("INSERT OR IGNORE INTO stars (tenant, project, user) VALUES (?1, ?2, ?3)")
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user)])?
        .run()
        .await?;
    let count = star_count(db, tenant, project).await?;
    Ok((true, count))
}

pub async fn unstar_project(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<(bool, u64)> {
    db.prepare("DELETE FROM stars WHERE tenant = ?1 AND project = ?2 AND user = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user)])?
        .run()
        .await?;
    let count = star_count(db, tenant, project).await?;
    Ok((false, count))
}

pub async fn is_starred(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<bool> {
    #[derive(Deserialize)]
    struct CountRow {
        count: f64,
    }
    let row: Option<CountRow> = db
        .prepare("SELECT COUNT(*) AS count FROM stars WHERE tenant = ?1 AND project = ?2 AND user = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user)])?
        .first(None)
        .await?;
    Ok(row.map(|r| r.count as u64).unwrap_or(0) > 0)
}

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
         ON CONFLICT(tenant, project, id) DO UPDATE SET kind = excluded.kind, size = excluded.size"
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

async fn star_count(db: &D1Database, tenant: &str, project: &str) -> Result<u64> {
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
