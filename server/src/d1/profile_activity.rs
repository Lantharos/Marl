use super::*;
use sty_protocol::HomeActivityItem;

pub async fn profile_activity(
    db: &Database,
    user: &str,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    let history = profile_history_activity(db, user, limit).await?;
    let issues = profile_issue_activity(db, user, limit).await?;
    let mut items = history
        .into_iter()
        .chain(issues.into_iter())
        .collect::<Vec<_>>();
    items.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    items.truncate(limit);
    Ok(items)
}

async fn profile_history_activity(
    db: &Database,
    user: &str,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    let result = db
        .prepare(
            "SELECT h.id, h.tenant, h.project, h.kind, h.message, h.workspace, h.timestamp
             FROM history h
             JOIN projects p ON p.tenant = h.tenant AND p.project = h.project
             WHERE h.author = ?1
             AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             ORDER BY h.timestamp DESC
             LIMIT ?2",
        )
        .bind(&[js_str(user), wasm_bindgen::JsValue::from_f64(limit as f64)])?
        .all()
        .await?;
    #[derive(Deserialize)]
    struct Row {
        id: String,
        tenant: String,
        project: String,
        kind: String,
        message: String,
        workspace: String,
        timestamp: String,
    }
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| HomeActivityItem {
            href: format!("/{}/{}/history/{}", row.tenant, row.project, row.id),
            tenant: row.tenant,
            project: row.project,
            kind: row.kind.clone(),
            title: profile_history_title(&row.kind, &row.message),
            detail: (!row.message.trim().is_empty()).then_some(row.message),
            timestamp: row.timestamp,
            actor: Some(user.to_string()),
            actor_profile: None,
            workspace: Some(row.workspace),
        })
        .collect())
}

async fn profile_issue_activity(
    db: &Database,
    user: &str,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    let result = db
        .prepare(
            "SELECT i.tenant, i.project, i.id, i.number, i.title, i.status, i.created_at,
                    COALESCE(i.closed_at, i.updated_at, i.created_at) AS activity_at, i.workspace
             FROM issues i
             JOIN projects p ON p.tenant = i.tenant AND p.project = i.project
             WHERE i.author = ?1
             AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             ORDER BY activity_at DESC
             LIMIT ?2",
        )
        .bind(&[js_str(user), wasm_bindgen::JsValue::from_f64(limit as f64)])?
        .all()
        .await?;
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
        id: String,
        number: f64,
        title: String,
        status: String,
        created_at: String,
        activity_at: String,
        workspace: Option<String>,
    }
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let action = if row.status == "closed" {
                "closed"
            } else if row.activity_at != row.created_at {
                "updated"
            } else {
                "opened"
            };
            HomeActivityItem {
                href: format!("/{}/{}/issues/{}", row.tenant, row.project, row.id),
                tenant: row.tenant,
                project: row.project,
                kind: "issue".to_string(),
                title: format!("{action} issue #{}", row.number as u64),
                detail: Some(row.title),
                timestamp: row.activity_at,
                actor: Some(user.to_string()),
                actor_profile: None,
                workspace: row.workspace,
            }
        })
        .collect())
}

fn profile_history_title(kind: &str, message: &str) -> String {
    match kind {
        "ship" => "shipped".to_string(),
        "ready" => "marked a workspace ready".to_string(),
        "merge" => "merged a workspace".to_string(),
        _ if !message.trim().is_empty() => message.to_string(),
        _ => "updated a project".to_string(),
    }
}
