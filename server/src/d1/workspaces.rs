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
        .prepare(
            "SELECT wh.head
             FROM workspace_heads wh
             LEFT JOIN workspace_states ws ON ws.tenant = wh.tenant AND ws.project = wh.project AND ws.workspace = wh.workspace
             WHERE wh.tenant = ?1 AND wh.project = ?2 AND wh.workspace = ?3
               AND COALESCE(ws.status, 'active') != 'deleted'",
        )
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
        present: i64,
    }
    let row: Option<Row> = db
        .prepare("SELECT 1 AS present FROM workspace_states WHERE tenant = ?1 AND project = ?2 AND workspace = ?3 AND status != 'deleted'")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .first(None)
        .await?;
    Ok(row.is_some_and(|row| row.present == 1))
}

pub struct WorkspaceSyncState {
    pub status: String,
    pub head: Option<String>,
    pub parent_workspace: Option<String>,
}

pub async fn workspace_state(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<Option<WorkspaceSyncState>> {
    #[derive(Deserialize)]
    struct Row {
        status: String,
        head: Option<String>,
        parent_workspace: Option<String>,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT ws.status, wh.head, ws.parent_workspace
             FROM workspace_states ws
             LEFT JOIN workspace_heads wh ON wh.tenant = ws.tenant AND wh.project = ws.project AND wh.workspace = ws.workspace
             WHERE ws.tenant = ?1 AND ws.project = ?2 AND ws.workspace = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .first(None)
        .await?;
    Ok(row.map(|row| WorkspaceSyncState {
        status: row.status,
        head: row.head,
        parent_workspace: row.parent_workspace,
    }))
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

pub async fn force_update_head(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    new_head: &str,
) -> Result<bool> {
    db.prepare(
        "INSERT INTO workspace_heads (tenant, project, workspace, head)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(tenant, project, workspace) DO UPDATE SET head = excluded.head",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(workspace),
        js_str(new_head),
    ])?
    .run()
    .await?;

    db.prepare(
        "INSERT INTO workspace_states (tenant, project, workspace, status, is_ready, parent_workspace, mergeable)
         VALUES (?1, ?2, ?3, 'active', 0, NULL, 0)
         ON CONFLICT(tenant, project, workspace) DO NOTHING",
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
        labels_json: Option<String>,
        reviewers_json: Option<String>,
        assignees_json: Option<String>,
        milestone: Option<String>,
        linked_issues_json: Option<String>,
        locked: Option<i64>,
        is_ready: i64,
        mergeable: i64,
    }
    let result = db
        .prepare(
            "SELECT ws.workspace, ws.status, wh.head, ws.parent_workspace, ws.labels_json, ws.reviewers_json, \
                ws.assignees_json, ws.milestone, ws.linked_issues_json, ws.locked, ws.is_ready, ws.mergeable, \
                (SELECT MAX(timestamp) FROM history h WHERE h.tenant = ws.tenant AND h.project = ws.project AND h.workspace = ws.workspace) AS last_activity_at \
             FROM workspace_states ws \
             LEFT JOIN workspace_heads wh ON wh.tenant = ws.tenant AND wh.project = ws.project AND wh.workspace = ws.workspace \
             WHERE ws.tenant = ?1 AND ws.project = ?2 AND ws.status != 'deleted' \
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
            labels: workspace_labels(r.labels_json),
            reviewers: workspace_string_list(r.reviewers_json, 15),
            assignees: workspace_string_list(r.assignees_json, 10),
            milestone: r.milestone.filter(|value| !value.trim().is_empty()),
            linked_issues: workspace_string_list(r.linked_issues_json, 10),
            locked: r.locked.unwrap_or(0) != 0,
            changed_file_count: 0,
            additions: 0,
            deletions: 0,
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

pub async fn set_workspace_labels(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    labels: &[String],
) -> Result<()> {
    let labels_json = serde_json::to_string(labels).map_err(|error| err(error.to_string()))?;
    db.prepare("UPDATE workspace_states SET labels_json = ?1 WHERE tenant = ?2 AND project = ?3 AND workspace = ?4")
        .bind(&[js_str(&labels_json), js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    Ok(())
}

pub async fn set_workspace_metadata(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    reviewers: &[String],
    assignees: &[String],
    milestone: Option<&str>,
    linked_issues: &[String],
    locked: bool,
) -> Result<()> {
    let reviewers_json =
        serde_json::to_string(reviewers).map_err(|error| err(error.to_string()))?;
    let assignees_json =
        serde_json::to_string(assignees).map_err(|error| err(error.to_string()))?;
    let linked_issues_json =
        serde_json::to_string(linked_issues).map_err(|error| err(error.to_string()))?;
    db.prepare(
        "UPDATE workspace_states SET reviewers_json = ?1, assignees_json = ?2, milestone = ?3, linked_issues_json = ?4, locked = ?5 \
         WHERE tenant = ?6 AND project = ?7 AND workspace = ?8"
    )
    .bind(&[
        js_str(&reviewers_json),
        js_str(&assignees_json),
        js_opt(milestone),
        js_str(&linked_issues_json),
        wasm_bindgen::JsValue::from_f64(if locked { 1.0 } else { 0.0 }),
        js_str(tenant),
        js_str(project),
        js_str(workspace),
    ])?
    .run()
    .await?;
    Ok(())
}

fn workspace_labels(value: Option<String>) -> Vec<String> {
    value
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|label| label.trim().to_string())
        .filter(|label| !label.is_empty())
        .take(8)
        .collect()
}

fn workspace_string_list(value: Option<String>, limit: usize) -> Vec<String> {
    value
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .take(limit)
        .collect()
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
    db.prepare("UPDATE workspace_states SET status = 'changes_requested', is_ready = 0, mergeable = 0 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
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
    snapshot_id: &str,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET status = 'merged', is_ready = 0, mergeable = 0 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
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
        Some(snapshot_id),
        None,
    )
    .await?;
    recompute_project_stats(db, tenant, project).await?;
    Ok(())
}

pub async fn close_workspace(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    status: &str,
    principal: &TokenPrincipal,
    reason: Option<&str>,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET status = ?1, is_ready = 0, mergeable = 0 WHERE tenant = ?2 AND project = ?3 AND workspace = ?4")
        .bind(&[js_str(status), js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    let message = reason
        .map(|value| format!("{status} workspace {workspace}: {value}"))
        .unwrap_or_else(|| format!("{status} workspace {workspace}"));
    log_history(
        db, tenant, project, workspace, principal, status, &message, None, None,
    )
    .await?;
    recompute_project_stats(db, tenant, project).await?;
    Ok(())
}

pub async fn reopen_workspace(
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
        .map(|value| format!("reopened workspace {workspace}: {value}"))
        .unwrap_or_else(|| format!("reopened workspace {workspace}"));
    log_history(
        db, tenant, project, workspace, principal, "ready", &message, None, None,
    )
    .await?;
    recompute_project_stats(db, tenant, project).await?;
    Ok(())
}

pub async fn delete_draft_workspace(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    db.prepare("UPDATE workspace_states SET status = 'deleted', is_ready = 0, mergeable = 0 WHERE tenant = ?1 AND project = ?2 AND workspace = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
    log_history(
        db,
        tenant,
        project,
        workspace,
        principal,
        "delete",
        &format!("deleted draft workspace {workspace}"),
        None,
        None,
    )
    .await?;
    recompute_project_stats(db, tenant, project).await?;
    Ok(())
}

// -- History ----------------------------------------------
