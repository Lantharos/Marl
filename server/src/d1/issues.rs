use super::*;
pub async fn list_issues(db: &Database, tenant: &str, project: &str) -> Result<Vec<Issue>> {
    #[derive(Deserialize)]
    struct Row {
        id: String,
        number: f64,
        title: String,
        body: String,
        status: String,
        author: String,
        created_at: String,
        updated_at: Option<String>,
        closed_at: Option<String>,
        assignees_json: Option<String>,
        milestone: Option<String>,
        workspace: Option<String>,
        labels_json: String,
        display_name: Option<String>,
        handle: Option<String>,
        avatar_url: Option<String>,
        email: Option<String>,
        profile_updated_at: Option<String>,
    }
    let result = db
        .prepare(
            "SELECT i.id, i.number, i.title, i.body, i.status, i.author, i.created_at, i.updated_at, i.closed_at, i.assignees_json, i.milestone, i.workspace, i.labels_json, \
             u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at \
             FROM issues i \
             LEFT JOIN user_profiles u ON u.user = i.author \
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
                author_profile: user_profile_from_parts(
                    &r.author,
                    r.display_name,
                    r.handle,
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
                milestone: r.milestone,
                workspace: r.workspace,
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
    assignee: Option<&str>,
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
    let labels_json = serde_json::to_string(labels).map_err(|e| err(e.to_string()))?;
    let assignees = assignee
        .map(|user| vec![user.to_string()])
        .unwrap_or_default();
    let assignees_json = serde_json::to_string(&assignees).map_err(|e| err(e.to_string()))?;

    db.prepare(
        "INSERT INTO issues (id, tenant, project, number, title, body, status, author, created_at, updated_at, closed_at, assignees_json, milestone, workspace, labels_json) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?8, ?8, NULL, ?9, NULL, NULL, ?10)"
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
        js_str(&labels_json),
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
) -> Result<Issue> {
    let updated_at = now_rfc3339();
    let closed_at = if status == "closed" {
        Some(updated_at.as_str())
    } else {
        None
    };
    db.prepare(
        "UPDATE issues SET status = ?1, updated_at = ?2, closed_at = ?3 WHERE tenant = ?4 AND project = ?5 AND id = ?6"
    )
    .bind(&[js_str(status), js_str(&updated_at), js_opt(closed_at), js_str(tenant), js_str(project), js_str(issue_id)])?
    .run()
    .await?;
    recompute_project_stats(db, tenant, project).await?;

    list_issues(db, tenant, project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id)
        .ok_or_else(|| err("issue not found"))
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
        display_name: Option<String>,
        handle: Option<String>,
        avatar_url: Option<String>,
        email: Option<String>,
        profile_updated_at: Option<String>,
    }
    let result = db
        .prepare(
            "SELECT c.id, c.issue_id, c.author, c.body, c.created_at, \
             u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at \
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
                r.avatar_url,
                r.email,
                r.profile_updated_at,
            ),
            author: r.author,
            body: r.body,
            created_at: r.created_at,
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
) -> Result<Comment> {
    let id = format!("comment-{}", Uuid::new_v4().simple());
    let created_at = now_rfc3339();
    db.prepare(
        "INSERT INTO comments (id, tenant, project, issue_id, author, body, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
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
        author_profile: user_profile(db, &principal.user).await?,
        body: body.to_string(),
        created_at,
    })
}
