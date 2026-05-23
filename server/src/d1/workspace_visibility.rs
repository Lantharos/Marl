use super::*;

pub const WORKSPACE_VISIBILITY_PRIVATE: &str = "private";
pub const WORKSPACE_VISIBILITY_TEAM: &str = "team";
pub const WORKSPACE_VISIBILITY_PUBLIC: &str = "public";

#[derive(Clone)]
pub struct WorkspaceVisibility {
    pub visibility: String,
    pub created_by: Option<String>,
    pub status: String,
}

pub fn normalize_workspace_visibility(value: &str) -> Result<String> {
    let value = value.trim().to_ascii_lowercase();
    match value.as_str() {
        WORKSPACE_VISIBILITY_PRIVATE | WORKSPACE_VISIBILITY_TEAM | WORKSPACE_VISIBILITY_PUBLIC => {
            Ok(value)
        }
        _ => Err(err("invalid workspace visibility")),
    }
}

pub fn default_workspace_visibility(workspace: &str) -> &'static str {
    if workspace == "main" {
        WORKSPACE_VISIBILITY_PUBLIC
    } else {
        WORKSPACE_VISIBILITY_TEAM
    }
}

pub async fn workspace_visibility(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<Option<WorkspaceVisibility>> {
    #[derive(Deserialize)]
    struct Row {
        visibility: Option<String>,
        created_by: Option<String>,
        status: String,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT visibility, created_by, status
             FROM workspace_states
             WHERE tenant = ?1 AND project = ?2 AND workspace = ?3 AND status != 'deleted'",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .first(None)
        .await?;
    Ok(row.map(|row| WorkspaceVisibility {
        visibility: row
            .visibility
            .unwrap_or_else(|| default_workspace_visibility(workspace).to_string()),
        created_by: row.created_by,
        status: row.status,
    }))
}

pub async fn workspace_can_read(
    db: &Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
    workspace: &str,
) -> Result<bool> {
    if workspace == "main" {
        return Ok(true);
    }
    let Some(state) = workspace_visibility(db, tenant, project, workspace).await? else {
        return Ok(false);
    };
    if user.is_some_and(|value| value.starts_with("api-key:")) {
        return Ok(true);
    }
    let role = match user {
        Some(user) => project_effective_role(db, tenant, project, user).await?,
        None => None,
    };
    Ok(workspace_visibility_allows_read(&state, user, role.as_deref()))
}

pub async fn workspace_can_write(
    db: &Database,
    tenant: &str,
    project: &str,
    user: &str,
    workspace: &str,
) -> Result<bool> {
    if workspace == "main" {
        return Ok(true);
    }
    let Some(state) = workspace_visibility(db, tenant, project, workspace).await? else {
        return Ok(true);
    };
    if user.starts_with("api-key:") {
        return Ok(true);
    }
    if state.visibility != WORKSPACE_VISIBILITY_PRIVATE {
        return Ok(true);
    }
    workspace_can_manage_visibility(db, tenant, project, user, workspace).await
}

pub async fn workspace_can_manage_visibility(
    db: &Database,
    tenant: &str,
    project: &str,
    user: &str,
    workspace: &str,
) -> Result<bool> {
    let role = project_effective_role(db, tenant, project, user).await?;
    if role_allows(role.as_deref(), ROLE_MAINTAINER) {
        return Ok(true);
    }
    let Some(state) = workspace_visibility(db, tenant, project, workspace).await? else {
        return Ok(false);
    };
    Ok(state.created_by.as_deref() == Some(user))
}

pub async fn filter_visible_workspaces(
    db: &Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
    workspaces: Vec<WorkspaceState>,
) -> Result<Vec<WorkspaceState>> {
    let role = match user {
        Some(user) => project_effective_role(db, tenant, project, user).await?,
        None => None,
    };
    if user.is_some_and(|value| value.starts_with("api-key:")) {
        return Ok(workspaces);
    }
    Ok(workspaces
        .into_iter()
        .filter(|workspace| workspace_state_allows_read(workspace, user, role.as_deref()))
        .collect())
}

pub async fn visible_workspace_counts(
    db: &Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<(u64, u64)> {
    let workspaces = filter_visible_workspaces(
        db,
        tenant,
        project,
        user,
        workspace_states(db, tenant, project).await?,
    )
    .await?;
    let workspace_count = workspaces
        .iter()
        .filter(|workspace| {
            workspace.name != "main"
                && !matches!(
                    workspace.status.as_str(),
                    "merged" | "closed" | "not_planned" | "deleted"
                )
        })
        .count() as u64;
    let ready_count = workspaces
        .iter()
        .filter(|workspace| {
            workspace.name != "main" && workspace.status != "deleted" && workspace.is_ready
        })
        .count() as u64;
    Ok((workspace_count, ready_count))
}

pub async fn visible_history_count(
    db: &Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<u64> {
    if user.is_some_and(|value| value.starts_with("api-key:")) {
        return history_count_where(db, tenant, project, "1 = 1", None).await;
    }
    let role = match user {
        Some(user) => project_effective_role(db, tenant, project, user).await?,
        None => None,
    };
    if role_allows(role.as_deref(), ROLE_MAINTAINER) {
        return history_count_where(db, tenant, project, "1 = 1", None).await;
    }
    if role.is_some() {
        return history_count_where(
            db,
            tenant,
            project,
            "(h.workspace = 'main' OR (ws.status != 'deleted' AND (ws.visibility IN ('public', 'team') OR ws.created_by = ?3)))",
            user,
        )
        .await;
    }
    history_count_where(
        db,
        tenant,
        project,
        "(h.workspace = 'main' OR (ws.status != 'deleted' AND ws.visibility = 'public'))",
        None,
    )
    .await
}

pub async fn visible_history_last_activity(
    db: &Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<Option<String>> {
    if user.is_some_and(|value| value.starts_with("api-key:")) {
        return history_last_activity_where(db, tenant, project, "1 = 1", None).await;
    }
    let role = match user {
        Some(user) => project_effective_role(db, tenant, project, user).await?,
        None => None,
    };
    if role_allows(role.as_deref(), ROLE_MAINTAINER) {
        return history_last_activity_where(db, tenant, project, "1 = 1", None).await;
    }
    if role.is_some() {
        return history_last_activity_where(
            db,
            tenant,
            project,
            "(h.workspace = 'main' OR (ws.status != 'deleted' AND (ws.visibility IN ('public', 'team') OR ws.created_by = ?3)))",
            user,
        )
        .await;
    }
    history_last_activity_where(
        db,
        tenant,
        project,
        "(h.workspace = 'main' OR (ws.status != 'deleted' AND ws.visibility = 'public'))",
        None,
    )
    .await
}

pub async fn workspace_is_publicly_readable(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<bool> {
    let project_public = matches!(
        project_visibility(db, tenant, project).await?,
        Some(visibility) if visibility == "public"
    );
    if !project_public {
        return Ok(false);
    }
    workspace_can_read(db, tenant, project, None, workspace).await
}

fn workspace_state_allows_read(
    workspace: &WorkspaceState,
    user: Option<&str>,
    role: Option<&str>,
) -> bool {
    if workspace.name == "main" {
        return true;
    }
    let state = WorkspaceVisibility {
        visibility: workspace.visibility.clone(),
        created_by: workspace.created_by.clone(),
        status: workspace.status.clone(),
    };
    workspace_visibility_allows_read(&state, user, role)
}

fn workspace_visibility_allows_read(
    state: &WorkspaceVisibility,
    user: Option<&str>,
    role: Option<&str>,
) -> bool {
    if state.status == "deleted" {
        return false;
    }
    match state.visibility.as_str() {
        WORKSPACE_VISIBILITY_PUBLIC => true,
        WORKSPACE_VISIBILITY_TEAM => role.is_some(),
        WORKSPACE_VISIBILITY_PRIVATE => {
            role_allows(role, ROLE_MAINTAINER) || user == state.created_by.as_deref()
        }
        _ => role.is_some(),
    }
}

async fn history_count_where(
    db: &Database,
    tenant: &str,
    project: &str,
    condition: &str,
    user: Option<&str>,
) -> Result<u64> {
    #[derive(Deserialize)]
    struct Row {
        count: f64,
    }
    let sql = format!(
        "SELECT COUNT(*) AS count
         FROM history h
         LEFT JOIN workspace_states ws
            ON ws.tenant = h.tenant
            AND ws.project = h.project
            AND ws.workspace = h.workspace
         WHERE h.tenant = ?1 AND h.project = ?2 AND {condition}"
    );
    let mut bindings = vec![js_str(tenant), js_str(project)];
    if let Some(user) = user {
        bindings.push(js_str(user));
    }
    let row: Option<Row> = db.prepare(&sql).bind(&bindings)?.first(None).await?;
    Ok(row.map(|row| row.count.max(0.0) as u64).unwrap_or(0))
}

async fn history_last_activity_where(
    db: &Database,
    tenant: &str,
    project: &str,
    condition: &str,
    user: Option<&str>,
) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        value: Option<String>,
    }
    let sql = format!(
        "SELECT MAX(h.timestamp) AS value
         FROM history h
         LEFT JOIN workspace_states ws
            ON ws.tenant = h.tenant
            AND ws.project = h.project
            AND ws.workspace = h.workspace
         WHERE h.tenant = ?1 AND h.project = ?2 AND {condition}"
    );
    let mut bindings = vec![js_str(tenant), js_str(project)];
    if let Some(user) = user {
        bindings.push(js_str(user));
    }
    let row: Option<Row> = db.prepare(&sql).bind(&bindings)?.first(None).await?;
    Ok(row.and_then(|row| row.value))
}
