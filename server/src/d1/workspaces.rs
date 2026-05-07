use super::*;
pub async fn head(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<Option<String>> {
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

pub async fn workspace_exists(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<bool> {
    #[derive(Deserialize)]
    struct Row {
        exists: i64,
    }
    let row: Option<Row> = db
        .prepare("SELECT 1 AS exists FROM workspace_states WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .first(None)
        .await?;
    Ok(row.is_some_and(|row| row.exists == 1))
}

pub async fn update_head(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    expected_head: Option<&str>,
    new_head: &str,
) -> Result<bool> {
    let result = db
        .prepare(
            "UPDATE workspace_heads
             SET head = ?4
             WHERE tenant = ?1 AND project = ?2 AND workspace = ?3
               AND ((?5 IS NULL AND head IS NULL) OR head = ?5)",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(workspace),
            js_str(new_head),
            js_opt(expected_head),
        ])?
        .run()
        .await?;
    let mut changed = result.meta()?.and_then(|meta| meta.changes).unwrap_or(0);

    if changed == 0 && expected_head.is_none() {
        let result = db
            .prepare(
                "INSERT OR IGNORE INTO workspace_heads (tenant, project, workspace, head)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(&[
                js_str(tenant),
                js_str(project),
                js_str(workspace),
                js_str(new_head),
            ])?
            .run()
            .await?;
        changed = result.meta()?.and_then(|meta| meta.changes).unwrap_or(0);
    }

    if changed == 0 {
        return Ok(false);
    }

    db.prepare(
        "INSERT INTO workspace_states (tenant, project, workspace, status, is_ready, parent_workspace, mergeable) \
         VALUES (?1, ?2, ?3, 'active', 0, NULL, 0) \
         ON CONFLICT(tenant, project, workspace) DO NOTHING"
    )
    .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
    .run()
    .await?;
    recompute_project_stats(db, tenant, project).await?;

    Ok(true)
}

// -- Workspace state --------------------------------------

pub async fn workspace_states(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<WorkspaceState>> {
    #[derive(Deserialize)]
    struct Row {
        workspace: String,
        status: String,
        head: Option<String>,
        parent_workspace: Option<String>,
        last_activity_at: Option<String>,
        is_ready: i64,
        mergeable: i64,
    }
    let result = db
        .prepare(
            "SELECT ws.workspace, ws.status, wh.head, ws.parent_workspace, ws.is_ready, ws.mergeable, \
                (SELECT MAX(timestamp) FROM history h WHERE h.tenant = ws.tenant AND h.project = ws.project AND h.workspace = ws.workspace) AS last_activity_at \
             FROM workspace_states ws \
             LEFT JOIN workspace_heads wh ON wh.tenant = ws.tenant AND wh.project = ws.project AND wh.workspace = ws.workspace \
             WHERE ws.tenant = ?1 AND ws.project = ?2 \
             ORDER BY COALESCE(last_activity_at, '') DESC, ws.workspace"
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
            last_activity_at: r.last_activity_at,
            child_workspaces: Vec::new(),
            is_ready: r.is_ready != 0,
            mergeable: r.mergeable != 0,
        })
        .collect();
    let mut parents = std::collections::HashMap::new();
    for ws in &states {
        if let Some(ref p) = ws.parent_workspace {
            parents
                .entry(p.clone())
                .or_insert_with(Vec::new)
                .push(ws.name.clone());
        }
    }
    for ws in &mut states {
        ws.child_workspaces = parents.get(&ws.name).cloned().unwrap_or_default();
    }
    Ok(states)
}

pub async fn set_parent_workspace(
    db: &Database,
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
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET status = 'ready', is_ready = 1 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    log_history(
        db,
        tenant,
        project,
        workspace,
        principal,
        "ready",
        &format!("marked workspace {workspace} as ready"),
        None,
        None,
    )
    .await?;
    Ok(())
}

pub async fn unmark_workspace_ready(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET status = 'active', is_ready = 0, mergeable = 0 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    log_history(
        db,
        tenant,
        project,
        workspace,
        principal,
        "ready",
        &format!("unmarked workspace {workspace} as ready"),
        None,
        None,
    )
    .await?;
    Ok(())
}

pub async fn reject_workspace_ready(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
    reason: Option<&str>,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET status = 'active', is_ready = 0, mergeable = 0 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    let message = reason
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("rejected workspace {workspace}: {value}"))
        .unwrap_or_else(|| format!("rejected workspace {workspace}"));
    log_history(
        db, tenant, project, workspace, principal, "ready", &message, None, None,
    )
    .await?;
    Ok(())
}

pub async fn merge_workspace(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET status = 'merged', is_ready = 0 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    log_history(
        db,
        tenant,
        project,
        workspace,
        principal,
        "merge",
        &format!("merged workspace {workspace}"),
        None,
        None,
    )
    .await?;
    Ok(())
}

// -- History ----------------------------------------------
