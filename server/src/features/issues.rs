use super::*;
use std::sync::atomic::{AtomicBool, Ordering};

static ISSUE_SCHEMA_READY: AtomicBool = AtomicBool::new(false);

pub async fn list_issues(db: &Database, tenant: &str, project: &str) -> Result<Vec<Issue>> {
    ensure_issue_schema(db).await?;
    #[derive(Deserialize)]
    struct Row {
        id: String,
        number: f64,
        title: String,
        body: String,
        status: String,
        state_reason: Option<String>,
        author: String,
        created_at: String,
        updated_at: Option<String>,
        closed_at: Option<String>,
        assignees_json: Option<String>,
        milestone: Option<String>,
        workspace: Option<String>,
        issue_type: Option<String>,
        locked: Option<f64>,
        pinned: Option<f64>,
        labels_json: String,
        components_json: String,
        display_name: Option<String>,
        handle: Option<String>,
        account_tenant: Option<String>,
        avatar_url: Option<String>,
        email: Option<String>,
        profile_updated_at: Option<String>,
        comment_count: f64,
    }
    let result = db
        .prepare(
            "WITH comment_counts AS (
                SELECT tenant, project, issue_id, COUNT(*) AS comment_count
                FROM comments
                WHERE tenant = ?1 AND project = ?2 AND COALESCE(target_type, 'comment') != 'activity'
                GROUP BY tenant, project, issue_id
             )
             SELECT i.id, i.number, i.title, i.body, i.status, i.state_reason, i.author, i.created_at, i.updated_at, i.closed_at, i.assignees_json, i.milestone, i.workspace, i.issue_type, i.locked, i.pinned, i.labels_json, i.components_json, \
             u.display_name, u.handle, \
             (SELECT t.name FROM tenants t WHERE t.owner = i.author AND t.kind = 'user' ORDER BY t.name LIMIT 1) AS account_tenant, \
             u.avatar_url, u.email, u.updated_at AS profile_updated_at, \
             COALESCE(cc.comment_count, 0) AS comment_count \
             FROM issues i \
             LEFT JOIN user_profiles u ON u.user = i.author \
             LEFT JOIN comment_counts cc ON cc.tenant = i.tenant AND cc.project = i.project AND cc.issue_id = i.id \
             WHERE i.tenant = ?1 AND i.project = ?2 ORDER BY i.number DESC"
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let created_at = r.created_at;
            Issue {
                id: r.id,
                number: r.number as u64,
                title: r.title,
                body: r.body,
                state: r.status.clone(),
                status: r.status,
                state_reason: r.state_reason,
                author_profile: user_profile_from_parts(
                    &r.author,
                    r.display_name,
                    r.handle,
                    r.account_tenant,
                    r.avatar_url,
                    r.email,
                    r.profile_updated_at,
                ),
                author: r.author,
                assignees: serde_json::from_str(r.assignees_json.as_deref().unwrap_or("[]"))
                    .unwrap_or_default(),
                updated_at: r.updated_at.unwrap_or_else(|| created_at.clone()),
                created_at,
                closed_at: r.closed_at,
                labels: serde_json::from_str(&r.labels_json).unwrap_or_default(),
                components: serde_json::from_str(&r.components_json).unwrap_or_default(),
                milestone: r.milestone,
                workspace: r.workspace,
                issue_type: r.issue_type,
                locked: r.locked.unwrap_or(0.0) != 0.0,
                pinned: r.pinned.unwrap_or(0.0) != 0.0,
                comment_count: r.comment_count as u64,
            }
        })
        .collect())
}

pub async fn create_issue(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
    title: &str,
    body: &str,
    labels: &[String],
    components: &[String],
    assignees: &[String],
    milestone: Option<&str>,
    issue_type: Option<&str>,
) -> Result<Issue> {
    ensure_issue_schema(db).await?;
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

    let id = format!("issue-{}", Uuid::new_v4().simple());
    let created_at = now_rfc3339();
    let labels_json = serde_json::to_string(labels).map_err(|e| err(e.to_string()))?;
    let components_json = serde_json::to_string(components).map_err(|e| err(e.to_string()))?;
    let assignees_json = serde_json::to_string(&assignees).map_err(|e| err(e.to_string()))?;

    db.prepare(
        "INSERT INTO issues (id, tenant, project, number, title, body, status, author, created_at, updated_at, closed_at, assignees_json, milestone, workspace, issue_type, locked, pinned, labels_json, components_json) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?8, ?8, NULL, ?9, ?10, NULL, ?11, 0, 0, ?12, ?13)"
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
        js_str(&assignees_json),
        js_opt(milestone),
        js_opt(issue_type),
        js_str(&labels_json),
        js_str(&components_json),
    ])?
    .run()
    .await?;
    recompute_project_stats(db, tenant, project).await?;

    list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|issue| issue.id == id)
        .ok_or_else(|| err("issue not found"))
}

pub async fn update_issue_status(
    db: &Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    status: &str,
    state_reason: Option<&str>,
) -> Result<Issue> {
    let issue = list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id)
        .ok_or_else(|| err("issue not found"))?;
    let updated_at = now_rfc3339();
    let closed_at = if status == "closed" {
        Some(updated_at.as_str())
    } else {
        None
    };
    let next_state_reason = if status == "closed" {
        state_reason
    } else {
        None
    };
    db.prepare(
        "UPDATE issues SET status = ?1, updated_at = ?2, closed_at = ?3, state_reason = ?4 WHERE tenant = ?5 AND project = ?6 AND id = ?7"
    )
    .bind(&[js_str(status), js_str(&updated_at), js_opt(closed_at), js_opt(next_state_reason), js_str(tenant), js_str(project), js_str(&issue.id)])?
    .run()
    .await?;
    recompute_project_stats(db, tenant, project).await?;

    list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|item| item.id == issue.id)
        .ok_or_else(|| err("issue not found"))
}

pub async fn transfer_issue(
    db: &Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    target_tenant: &str,
    target_project: &str,
) -> Result<Issue> {
    if !project_exists(db, target_tenant, target_project).await? {
        return Err(err("target project not found"));
    }
    let issue = list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id)
        .ok_or_else(|| err("issue not found"))?;
    #[derive(Deserialize)]
    struct CountRow {
        count: f64,
    }
    let count_row: Option<CountRow> = db
        .prepare("SELECT COALESCE(MAX(number), 0) + 1 AS count FROM issues WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(target_tenant), js_str(target_project)])?
        .first(None)
        .await?;
    let next_number = count_row.map(|r| r.count as u64).unwrap_or(1);
    let updated_at = now_rfc3339();
    db.prepare(
        "UPDATE issues SET tenant = ?1, project = ?2, number = ?3, updated_at = ?4 WHERE tenant = ?5 AND project = ?6 AND id = ?7",
    )
    .bind(&[
        js_str(target_tenant),
        js_str(target_project),
        wasm_bindgen::JsValue::from_f64(next_number as f64),
        js_str(&updated_at),
        js_str(tenant),
        js_str(project),
        js_str(&issue.id),
    ])?
    .run()
    .await?;
    db.prepare("UPDATE comments SET tenant = ?1, project = ?2 WHERE tenant = ?3 AND project = ?4 AND issue_id = ?5")
        .bind(&[
            js_str(target_tenant),
            js_str(target_project),
            js_str(tenant),
            js_str(project),
            js_str(&issue.id),
        ])?
        .run()
        .await?;
    recompute_project_stats(db, tenant, project).await?;
    recompute_project_stats(db, target_tenant, target_project).await?;
    list_issues(db, target_tenant, target_project)
        .await?
        .into_iter()
        .find(|item| item.id == issue.id)
        .ok_or_else(|| err("issue not found"))
}

pub async fn delete_issue(
    db: &Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
) -> Result<bool> {
    let Some(issue) = list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id)
    else {
        return Ok(false);
    };
    db.prepare("DELETE FROM comments WHERE tenant = ?1 AND project = ?2 AND issue_id = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(&issue.id)])?
        .run()
        .await?;
    delete_reactions_for_target(db, tenant, project, "issue", &issue.id).await?;
    db.prepare("DELETE FROM issues WHERE tenant = ?1 AND project = ?2 AND id = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(&issue.id)])?
        .run()
        .await?;
    recompute_project_stats(db, tenant, project).await?;
    Ok(true)
}

pub async fn update_issue(
    db: &Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    title: Option<&str>,
    body: Option<&str>,
    status: Option<&str>,
    labels: Option<&[String]>,
    components: Option<&[String]>,
    assignees: Option<&[String]>,
    milestone: Option<Option<&str>>,
    issue_type: Option<Option<&str>>,
    workspace: Option<Option<&str>>,
    locked: Option<bool>,
    pinned: Option<bool>,
) -> Result<Issue> {
    let issue = list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id)
        .ok_or_else(|| err("issue not found"))?;
    let updated_at = now_rfc3339();
    let next_status = status.unwrap_or(&issue.status);
    let next_closed_at = if next_status == "closed" {
        issue.closed_at.as_deref().or(Some(updated_at.as_str()))
    } else {
        None
    };
    let next_labels = labels.unwrap_or(&issue.labels);
    let next_components = components.unwrap_or(&issue.components);
    let next_assignees = assignees.unwrap_or(&issue.assignees);
    let next_milestone = milestone
        .map(|value| value.map(str::to_string))
        .unwrap_or_else(|| issue.milestone.clone());
    let next_issue_type = issue_type
        .map(|value| value.map(str::to_string))
        .unwrap_or_else(|| issue.issue_type.clone());
    let next_workspace = workspace
        .map(|value| value.map(str::to_string))
        .unwrap_or_else(|| issue.workspace.clone());
    let next_locked = locked.unwrap_or(issue.locked);
    let next_pinned = pinned.unwrap_or(issue.pinned);
    let labels_json = serde_json::to_string(next_labels).map_err(|e| err(e.to_string()))?;
    let components_json = serde_json::to_string(next_components).map_err(|e| err(e.to_string()))?;
    let assignees_json = serde_json::to_string(next_assignees).map_err(|e| err(e.to_string()))?;

    db.prepare(
        "UPDATE issues SET title = ?1, body = ?2, status = ?3, updated_at = ?4, closed_at = ?5, \
         labels_json = ?6, components_json = ?7, assignees_json = ?8, milestone = ?9, issue_type = ?10, workspace = ?11, locked = ?12, pinned = ?13 \
         WHERE tenant = ?14 AND project = ?15 AND id = ?16",
    )
    .bind(&[
        js_str(title.unwrap_or(&issue.title)),
        js_str(body.unwrap_or(&issue.body)),
        js_str(next_status),
        js_str(&updated_at),
        js_opt(next_closed_at),
        js_str(&labels_json),
        js_str(&components_json),
        js_str(&assignees_json),
        js_opt(next_milestone.as_deref()),
        js_opt(next_issue_type.as_deref()),
        js_opt(next_workspace.as_deref()),
        wasm_bindgen::JsValue::from_f64(if next_locked { 1.0 } else { 0.0 }),
        wasm_bindgen::JsValue::from_f64(if next_pinned { 1.0 } else { 0.0 }),
        js_str(tenant),
        js_str(project),
        js_str(&issue.id),
    ])?
    .run()
    .await?;
    recompute_project_stats(db, tenant, project).await?;

    list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|item| item.id == issue.id)
        .ok_or_else(|| err("issue not found"))
}

async fn ensure_issue_schema(db: &Database) -> Result<()> {
    if ISSUE_SCHEMA_READY.load(Ordering::Relaxed) {
        return Ok(());
    }
    let _ = db
        .prepare("ALTER TABLE issues ADD COLUMN components_json TEXT NOT NULL DEFAULT '[]'")
        .run()
        .await;
    ISSUE_SCHEMA_READY.store(true, Ordering::Relaxed);
    Ok(())
}

// -- Comments ---------------------------------------------

pub async fn add_issue_assignees(
    db: &Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    assignees: &[String],
) -> Result<Issue> {
    let mut issue = list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id)
        .ok_or_else(|| err("issue not found"))?;
    for assignee in assignees {
        if !issue.assignees.contains(assignee) {
            issue.assignees.push(assignee.clone());
        }
    }
    let updated_at = now_rfc3339();
    let assignees_json = serde_json::to_string(&issue.assignees).map_err(|e| err(e.to_string()))?;
    db.prepare(
        "UPDATE issues SET assignees_json = ?1, updated_at = ?2 WHERE tenant = ?3 AND project = ?4 AND id = ?5",
    )
    .bind(&[
        js_str(&assignees_json),
        js_str(&updated_at),
        js_str(tenant),
        js_str(project),
        js_str(issue_id),
    ])?
    .run()
    .await?;
    issue.updated_at = updated_at;
    Ok(issue)
}

pub async fn add_issue_labels(
    db: &Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    labels: &[String],
) -> Result<Issue> {
    let mut issue = list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id)
        .ok_or_else(|| err("issue not found"))?;
    for label in labels {
        if !issue.labels.contains(label) {
            issue.labels.push(label.clone());
        }
    }
    let updated_at = now_rfc3339();
    let labels_json = serde_json::to_string(&issue.labels).map_err(|e| err(e.to_string()))?;
    db.prepare(
        "UPDATE issues SET labels_json = ?1, updated_at = ?2 WHERE tenant = ?3 AND project = ?4 AND id = ?5",
    )
    .bind(&[
        js_str(&labels_json),
        js_str(&updated_at),
        js_str(tenant),
        js_str(project),
        js_str(issue_id),
    ])?
    .run()
    .await?;
    issue.updated_at = updated_at;
    Ok(issue)
}
pub async fn list_comments(
    db: &Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
) -> Result<Vec<Comment>> {
    #[derive(Deserialize)]
    struct Row {
        id: String,
        issue_id: String,
        author: String,
        body: String,
        created_at: String,
        target_type: Option<String>,
        target_id: Option<String>,
        display_name: Option<String>,
        handle: Option<String>,
        account_tenant: Option<String>,
        avatar_url: Option<String>,
        email: Option<String>,
        profile_updated_at: Option<String>,
    }
    let result = db
        .prepare(
            "SELECT c.id, c.issue_id, c.author, c.body, c.created_at, c.target_type, c.target_id, \
             u.display_name, u.handle, \
             (SELECT t.name FROM tenants t WHERE t.owner = c.author AND t.kind = 'user' ORDER BY t.name LIMIT 1) AS account_tenant, \
             u.avatar_url, u.email, u.updated_at AS profile_updated_at \
             FROM comments c \
             LEFT JOIN user_profiles u ON u.user = c.author \
             WHERE c.tenant = ?1 AND c.project = ?2 AND c.issue_id = ?3 \
             ORDER BY c.created_at",
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
            author_profile: user_profile_from_parts(
                &r.author,
                r.display_name,
                r.handle,
                r.account_tenant,
                r.avatar_url,
                r.email,
                r.profile_updated_at,
            ),
            author: r.author,
            body: r.body,
            created_at: r.created_at,
            target_type: r.target_type,
            target_id: r.target_id,
        })
        .collect())
}

pub async fn create_comment(
    db: &Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    principal: &TokenPrincipal,
    body: &str,
    target_type: Option<&str>,
    target_id: Option<&str>,
) -> Result<Comment> {
    let id = format!("comment-{}", Uuid::new_v4().simple());
    let created_at = now_rfc3339();
    let normalized_target_type = target_type
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("comment");
    db.prepare(
        "INSERT INTO comments (id, tenant, project, issue_id, author, body, created_at, target_type, target_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        js_str(issue_id),
        js_str(&principal.user),
        js_str(body),
        js_str(&created_at),
        js_str(normalized_target_type),
        js_opt(target_id),
    ])?
    .run()
    .await?;
    Ok(Comment {
        id,
        issue_id: issue_id.to_string(),
        author: principal.user.clone(),
        author_profile: user_profile(db, &principal.user).await?,
        body: body.to_string(),
        created_at,
        target_type: Some(normalized_target_type.to_string()),
        target_id: target_id.map(str::to_string),
    })
}
