use super::*;
use sty_protocol::HomeActivityItem;

pub async fn followed_activity(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    ensure_collaboration_schema(db).await?;
    let mut items = followed_history_activity(db, principal, limit).await?;
    items.extend(followed_issue_activity(db, principal, limit).await?);
    items.extend(followed_release_activity(db, principal, limit).await?);
    items.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    items.truncate(limit);
    Ok(items)
}

pub async fn project_activity(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    ensure_collaboration_schema(db).await?;
    let mut items = project_history_activity(db, principal, limit).await?;
    items.extend(project_issue_activity(db, principal, limit).await?);
    items.extend(project_release_activity(db, principal, limit).await?);
    items.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    items.truncate(limit);
    Ok(items)
}

async fn followed_history_activity(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    let result = db
        .prepare(
            "SELECT h.id, h.tenant, h.project, h.kind, h.message, h.workspace, h.timestamp, h.author,
                    u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at
             FROM project_follows f
             JOIN projects p ON p.tenant = f.tenant AND p.project = f.project
             JOIN tenants t ON t.name = p.tenant
             JOIN history h ON h.tenant = p.tenant AND h.project = p.project
             LEFT JOIN user_profiles u ON u.user = h.author
             WHERE f.user = ?1
                AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
                AND h.kind IN ('ready', 'merge', 'ship')
                AND (
                    t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (
                        SELECT 1 FROM tenant_members tm
                        WHERE tm.tenant = t.name AND tm.user = ?1 AND tm.role IN ('contributor', 'maintainer')
                    )
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                        WHERE pm.tenant = p.tenant
                            AND pm.project = p.project
                            AND pm.user = ?1
                            AND pm.role IN ('contributor', 'maintainer')
                    )
                )
             ORDER BY h.timestamp DESC
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ActivityHistoryRow> = result.results()?;
    Ok(rows.into_iter().map(history_activity_item).collect())
}

async fn followed_issue_activity(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    let result = db
        .prepare(
            "SELECT i.tenant, i.project, i.id, i.number, i.title, i.status, i.author,
                    i.created_at, i.updated_at, i.closed_at, i.workspace,
                    COALESCE(i.closed_at, i.updated_at, i.created_at) AS activity_at,
                    u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at
             FROM project_follows f
             JOIN projects p ON p.tenant = f.tenant AND p.project = f.project
             JOIN tenants t ON t.name = p.tenant
             JOIN issues i ON i.tenant = p.tenant AND i.project = p.project
             LEFT JOIN user_profiles u ON u.user = i.author
             WHERE f.user = ?1
                AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
                AND (
                    t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (
                        SELECT 1 FROM tenant_members tm
                        WHERE tm.tenant = t.name AND tm.user = ?1 AND tm.role IN ('contributor', 'maintainer')
                    )
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                        WHERE pm.tenant = p.tenant
                            AND pm.project = p.project
                            AND pm.user = ?1
                            AND pm.role IN ('contributor', 'maintainer')
                    )
                )
             ORDER BY activity_at DESC
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ActivityIssueRow> = result.results()?;
    Ok(rows.into_iter().map(issue_activity_item).collect())
}

async fn project_history_activity(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    let result = db
        .prepare(
            "SELECT h.id, h.tenant, h.project, h.kind, h.message, h.workspace, h.timestamp, h.author,
                    u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at
             FROM projects p
             JOIN tenants t ON t.name = p.tenant
             JOIN history h ON h.tenant = p.tenant AND h.project = p.project
             LEFT JOIN user_profiles u ON u.user = h.author
             WHERE h.kind IN ('ready', 'merge', 'ship')
                AND (
                    t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (
                        SELECT 1 FROM tenant_members tm
                        WHERE tm.tenant = t.name AND tm.user = ?1 AND tm.role IN ('contributor', 'maintainer')
                    )
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                        WHERE pm.tenant = p.tenant
                            AND pm.project = p.project
                            AND pm.user = ?1
                            AND pm.role IN ('contributor', 'maintainer')
                    )
                )
             ORDER BY h.timestamp DESC
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ActivityHistoryRow> = result.results()?;
    Ok(rows.into_iter().map(history_activity_item).collect())
}

async fn project_issue_activity(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    let result = db
        .prepare(
            "SELECT i.tenant, i.project, i.id, i.number, i.title, i.status, i.author,
                    i.created_at, i.updated_at, i.closed_at, i.workspace,
                    COALESCE(i.closed_at, i.updated_at, i.created_at) AS activity_at,
                    u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at
             FROM projects p
             JOIN tenants t ON t.name = p.tenant
             JOIN issues i ON i.tenant = p.tenant AND i.project = p.project
             LEFT JOIN user_profiles u ON u.user = i.author
             WHERE (
                    t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (
                        SELECT 1 FROM tenant_members tm
                        WHERE tm.tenant = t.name AND tm.user = ?1 AND tm.role IN ('contributor', 'maintainer')
                    )
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                        WHERE pm.tenant = p.tenant
                            AND pm.project = p.project
                            AND pm.user = ?1
                            AND pm.role IN ('contributor', 'maintainer')
                    )
                )
             ORDER BY activity_at DESC
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ActivityIssueRow> = result.results()?;
    Ok(rows.into_iter().map(issue_activity_item).collect())
}

async fn project_release_activity(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, pi.data_json AS release_json, pi.created_at AS released_at
             FROM projects p
             JOIN tenants t ON t.name = p.tenant
             JOIN protocol_items pi ON pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release'
             WHERE (
                    t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (
                        SELECT 1 FROM tenant_members tm
                        WHERE tm.tenant = t.name AND tm.user = ?1 AND tm.role IN ('contributor', 'maintainer')
                    )
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                        WHERE pm.tenant = p.tenant
                            AND pm.project = p.project
                            AND pm.user = ?1
                            AND pm.role IN ('contributor', 'maintainer')
                    )
                )
             ORDER BY pi.created_at DESC
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ActivityReleaseRow> = result.results()?;
    Ok(rows.into_iter().filter_map(release_activity_item).collect())
}

async fn followed_release_activity(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeActivityItem>> {
    let releases = followed_release_feed(db, principal, limit).await?;
    Ok(releases
        .into_iter()
        .map(|item| {
            let title = item
                .release
                .get("name")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .or_else(|| item.release.get("tag").and_then(|value| value.as_str()))
                .unwrap_or("Release")
                .to_string();
            HomeActivityItem {
                href: format!("/{}/{}/releases", item.tenant, item.project),
                tenant: item.tenant,
                project: item.project,
                kind: "release".to_string(),
                detail: item
                    .release
                    .get("tag")
                    .and_then(|value| value.as_str())
                    .map(ToOwned::to_owned),
                title,
                timestamp: item.released_at,
                actor: None,
                actor_profile: None,
                workspace: None,
            }
        })
        .collect())
}

fn history_activity_item(row: ActivityHistoryRow) -> HomeActivityItem {
    let href = format!("/{}/{}/history/{}", row.tenant, row.project, row.id);
    let detail = if row.message.trim().is_empty() {
        None
    } else {
        Some(row.message.clone())
    };
    HomeActivityItem {
        tenant: row.tenant,
        project: row.project,
        kind: row.kind.clone(),
        title: history_activity_title(&row.kind, &row.message),
        detail,
        href,
        timestamp: row.timestamp,
        actor_profile: user_profile_from_parts(
            &row.author,
            row.display_name,
            row.handle,
            None,
            row.avatar_url,
            row.email,
            row.profile_updated_at,
        ),
        actor: Some(row.author),
        workspace: Some(row.workspace),
    }
}

fn issue_activity_item(row: ActivityIssueRow) -> HomeActivityItem {
    let href = format!("/{}/{}/issues/{}", row.tenant, row.project, row.id);
    let title = issue_activity_title(&row);
    HomeActivityItem {
        tenant: row.tenant,
        project: row.project,
        kind: "issue".to_string(),
        title,
        detail: Some(row.title),
        href,
        timestamp: row.activity_at,
        actor_profile: user_profile_from_parts(
            &row.author,
            row.display_name,
            row.handle,
            None,
            row.avatar_url,
            row.email,
            row.profile_updated_at,
        ),
        actor: Some(row.author),
        workspace: row.workspace,
    }
}

fn release_activity_item(row: ActivityReleaseRow) -> Option<HomeActivityItem> {
    let release: serde_json::Value = serde_json::from_str(&row.release_json).ok()?;
    let title = release
        .get("name")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .or_else(|| release.get("tag").and_then(|value| value.as_str()))
        .unwrap_or("Release")
        .to_string();
    Some(HomeActivityItem {
        href: format!("/{}/{}/releases", row.tenant, row.project),
        tenant: row.tenant,
        project: row.project,
        kind: "release".to_string(),
        detail: release
            .get("tag")
            .and_then(|value| value.as_str())
            .map(ToOwned::to_owned),
        title,
        timestamp: row.released_at,
        actor: None,
        actor_profile: None,
        workspace: None,
    })
}

fn history_activity_title(kind: &str, message: &str) -> String {
    match kind {
        "ship" => "shipped".to_string(),
        "ready" => "marked a workspace ready".to_string(),
        "merge" => "merged a workspace".to_string(),
        _ if !message.trim().is_empty() => message.to_string(),
        _ => "updated a project".to_string(),
    }
}

fn issue_activity_title(row: &ActivityIssueRow) -> String {
    let action = if row.status == "closed" {
        "closed"
    } else if row
        .updated_at
        .as_ref()
        .is_some_and(|updated_at| updated_at != &row.created_at)
    {
        "updated"
    } else {
        "opened"
    };
    format!("{} issue #{}", action, row.number as u64)
}

#[derive(Deserialize)]
struct ActivityHistoryRow {
    id: String,
    tenant: String,
    project: String,
    kind: String,
    message: String,
    workspace: String,
    timestamp: String,
    author: String,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    profile_updated_at: Option<String>,
}

#[derive(Deserialize)]
struct ActivityIssueRow {
    tenant: String,
    project: String,
    id: String,
    number: f64,
    title: String,
    status: String,
    author: String,
    created_at: String,
    updated_at: Option<String>,
    workspace: Option<String>,
    activity_at: String,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    profile_updated_at: Option<String>,
}

#[derive(Deserialize)]
struct ActivityReleaseRow {
    tenant: String,
    project: String,
    release_json: String,
    released_at: String,
}
