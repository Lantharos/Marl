use super::*;

#[derive(Debug, Clone)]
pub struct ProjectObjectRow {
    pub id: String,
    pub kind: String,
    pub size: usize,
}

#[derive(Debug, Clone)]
pub struct ProjectForkRow {
    pub tenant: String,
    pub project: String,
    pub source_tenant: String,
    pub source_project: String,
    pub workspace: String,
}

#[derive(Debug, Clone)]
struct HistoryRow {
    workspace: String,
    kind: String,
    message: String,
    author: String,
    timestamp: String,
    snapshot_id: Option<String>,
}

pub async fn ensure_fork_schema(db: &Database) -> Result<()> {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS project_forks (
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            source_tenant TEXT NOT NULL,
            source_project TEXT NOT NULL,
            workspace TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            sent_at TEXT,
            title TEXT,
            message TEXT,
            PRIMARY KEY (tenant, project)
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_project_forks_source
         ON project_forks(source_tenant, source_project)",
    )
    .run()
    .await?;
    Ok(())
}

pub async fn project_objects(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<ProjectObjectRow>> {
    #[derive(Deserialize)]
    struct Row {
        id: String,
        kind: String,
        size: i64,
    }
    let result = db
        .prepare(
            "SELECT id, kind, size
             FROM object_index
             WHERE tenant = ?1 AND project = ?2
             ORDER BY created_at",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| ProjectObjectRow {
            id: row.id,
            kind: row.kind,
            size: row.size.max(0) as usize,
        })
        .collect())
}

pub async fn create_fork_project(
    db: &Database,
    source_tenant: &str,
    source_project: &str,
    target_tenant: &str,
    target_project: &str,
    workspace: Option<&str>,
    principal: &TokenPrincipal,
) -> Result<()> {
    ensure_fork_schema(db).await?;
    if project_exists(db, target_tenant, target_project).await? {
        return Err(err("target project already exists"));
    }
    if !tenant_exists(db, target_tenant).await? {
        return Err(err(format!(
            "tenant `{target_tenant}` does not exist; create it first with `sty tenant new {target_tenant}`"
        )));
    }
    if !tenant_control(db, target_tenant, &principal.user).await? {
        return Err(err("tenant control denied"));
    }
    insert_fork_shell(db, target_tenant, target_project, principal).await?;
    copy_main_workspace(
        db,
        source_tenant,
        source_project,
        target_tenant,
        target_project,
    )
    .await?;
    if let Some(workspace) = workspace {
        create_contribution_workspace(db, target_tenant, target_project, workspace, "main").await?;
        db.prepare(
            "INSERT INTO project_forks
             (tenant, project, source_tenant, source_project, workspace, created_by, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(&[
            js_str(target_tenant),
            js_str(target_project),
            js_str(source_tenant),
            js_str(source_project),
            js_str(workspace),
            js_str(&principal.user),
            js_str(&now_rfc3339()),
        ])?
        .run()
        .await?;
    }
    recompute_project_stats(db, target_tenant, target_project).await?;
    Ok(())
}

pub async fn project_fork(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Option<ProjectForkRow>> {
    ensure_fork_schema(db).await?;
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
        source_tenant: String,
        source_project: String,
        workspace: String,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT tenant, project, source_tenant, source_project, workspace
             FROM project_forks
             WHERE tenant = ?1 AND project = ?2",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|row| ProjectForkRow {
        tenant: row.tenant,
        project: row.project,
        source_tenant: row.source_tenant,
        source_project: row.source_project,
        workspace: row.workspace,
    }))
}

pub async fn publish_fork_workspace(
    db: &Database,
    fork: &ProjectForkRow,
    title: &str,
    message: &str,
    head: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    db.prepare(
        "INSERT INTO workspace_heads (tenant, project, workspace, head)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(tenant, project, workspace) DO UPDATE SET head = excluded.head",
    )
    .bind(&[
        js_str(&fork.source_tenant),
        js_str(&fork.source_project),
        js_str(&fork.workspace),
        js_str(head),
    ])?
    .run()
    .await?;
    db.prepare(
        "INSERT INTO workspace_states
         (tenant, project, workspace, status, is_ready, parent_workspace, mergeable)
         VALUES (?1, ?2, ?3, 'ready', 1, 'main', 0)
         ON CONFLICT(tenant, project, workspace) DO UPDATE SET
             status = 'ready',
             is_ready = 1,
             parent_workspace = 'main',
             mergeable = 0",
    )
    .bind(&[
        js_str(&fork.source_tenant),
        js_str(&fork.source_project),
        js_str(&fork.workspace),
    ])?
    .run()
    .await?;
    let history_message = if message.trim().is_empty() {
        format!("sent work: {}", title.trim())
    } else {
        format!("sent work: {}\n\n{}", title.trim(), message.trim())
    };
    log_history(
        db,
        &fork.source_tenant,
        &fork.source_project,
        &fork.workspace,
        principal,
        "ready",
        &history_message,
        Some(head),
    )
    .await?;
    db.prepare(
        "UPDATE project_forks
         SET sent_at = ?1, title = ?2, message = ?3
         WHERE tenant = ?4 AND project = ?5",
    )
    .bind(&[
        js_str(&now_rfc3339()),
        js_str(title),
        js_str(message),
        js_str(&fork.tenant),
        js_str(&fork.project),
    ])?
    .run()
    .await?;
    recompute_project_stats(db, &fork.source_tenant, &fork.source_project).await?;
    Ok(())
}

async fn insert_fork_shell(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    let settings = serde_json::to_string(&ProjectSettings {
        visibility: "private".to_string(),
        follower_count: 0,
        is_following: false,
        public_releases: false,
        archived_at: None,
        archived_by: None,
        archived_by_profile: None,
        default_workspace: "main".to_string(),
        navbar_items: vec![],
        panels: vec![],
    })
    .map_err(|error| err(error.to_string()))?;
    db.prepare(
        "INSERT INTO projects (tenant, project, owner, settings_json)
         VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(&principal.user),
        js_str(&settings),
    ])?
    .run()
    .await?;
    Ok(())
}

async fn copy_main_workspace(
    db: &Database,
    source_tenant: &str,
    source_project: &str,
    target_tenant: &str,
    target_project: &str,
) -> Result<()> {
    let head = head(db, source_tenant, source_project, "main").await?;
    db.prepare(
        "INSERT INTO workspace_states
         (tenant, project, workspace, status, is_ready, parent_workspace, mergeable)
         VALUES (?1, ?2, 'main', 'active', 0, NULL, 0)",
    )
    .bind(&[js_str(target_tenant), js_str(target_project)])?
    .run()
    .await?;
    if let Some(head) = head.as_deref() {
        db.prepare(
            "INSERT INTO workspace_heads (tenant, project, workspace, head)
             VALUES (?1, ?2, 'main', ?3)",
        )
        .bind(&[js_str(target_tenant), js_str(target_project), js_str(head)])?
        .run()
        .await?;
    }
    copy_main_history(
        db,
        source_tenant,
        source_project,
        target_tenant,
        target_project,
    )
    .await
}

async fn copy_main_history(
    db: &Database,
    source_tenant: &str,
    source_project: &str,
    target_tenant: &str,
    target_project: &str,
) -> Result<()> {
    #[derive(Deserialize)]
    struct Row {
        workspace: String,
        kind: String,
        message: String,
        author: String,
        timestamp: String,
        snapshot_id: Option<String>,
    }
    let result = db
        .prepare(
            "SELECT workspace, kind, message, author, timestamp, snapshot_id
             FROM history
             WHERE tenant = ?1 AND project = ?2 AND workspace = 'main'
             ORDER BY timestamp",
        )
        .bind(&[js_str(source_tenant), js_str(source_project)])?
        .all()
        .await?;
    let rows = result
        .results::<Row>()?
        .into_iter()
        .map(|row| HistoryRow {
            workspace: row.workspace,
            kind: row.kind,
            message: row.message,
            author: row.author,
            timestamp: row.timestamp,
            snapshot_id: row.snapshot_id,
        })
        .collect::<Vec<_>>();
    for row in rows {
        db.prepare(
            "INSERT INTO history
             (id, tenant, project, workspace, kind, message, author, timestamp, snapshot_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .bind(&[
            js_str(&Uuid::new_v4().to_string()),
            js_str(target_tenant),
            js_str(target_project),
            js_str(&row.workspace),
            js_str(&row.kind),
            js_str(&row.message),
            js_str(&row.author),
            js_str(&row.timestamp),
            js_opt(row.snapshot_id.as_deref()),
        ])?
        .run()
        .await?;
    }
    Ok(())
}

async fn create_contribution_workspace(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    parent: &str,
) -> Result<()> {
    let head = head(db, tenant, project, parent).await?;
    db.prepare(
        "INSERT INTO workspace_states
         (tenant, project, workspace, status, is_ready, parent_workspace, mergeable)
         VALUES (?1, ?2, ?3, 'active', 0, ?4, 0)",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(workspace),
        js_str(parent),
    ])?
    .run()
    .await?;
    if let Some(head) = head.as_deref() {
        db.prepare(
            "INSERT INTO workspace_heads (tenant, project, workspace, head)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(workspace),
            js_str(head),
        ])?
        .run()
        .await?;
    }
    Ok(())
}
