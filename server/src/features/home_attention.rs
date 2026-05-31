use super::*;
use futures_util::future::try_join3;
use sty_protocol::{HomeAttention, HomeIssueItem, HomeMentionItem, HomeReadyWorkspace};

pub async fn home_attention(db: &Database, principal: &TokenPrincipal) -> Result<HomeAttention> {
    let (ready_workspaces, assigned_issues, mentions) = try_join3(
        home_ready_workspaces(db, principal, 25),
        home_assigned_issues(db, principal, 25),
        home_mentions(db, principal, 25),
    )
    .await?;
    Ok(HomeAttention {
        ready_workspaces,
        assigned_issues,
        mentions,
    })
}

async fn home_ready_workspaces(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeReadyWorkspace>> {
    ensure_collaboration_schema(db).await?;
    let result = db
        .prepare(
            "SELECT ws.tenant, ws.project, ws.workspace, wh.head, ws.parent_workspace, ws.mergeable,
                    h.author, h.timestamp AS marked_at,
                    u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at
             FROM workspace_states ws
             JOIN projects p ON p.tenant = ws.tenant AND p.project = ws.project
             JOIN tenants t ON t.name = p.tenant
             LEFT JOIN workspace_heads wh
                ON wh.tenant = ws.tenant AND wh.project = ws.project AND wh.workspace = ws.workspace
             LEFT JOIN history h
                ON h.id = (
                    SELECT hh.id
                    FROM history hh
                    WHERE hh.tenant = ws.tenant
                        AND hh.project = ws.project
                        AND hh.workspace = ws.workspace
                        AND hh.kind = 'ready'
                    ORDER BY hh.timestamp DESC
                    LIMIT 1
                )
             LEFT JOIN user_profiles u ON u.user = h.author
             WHERE ws.is_ready = 1
                AND ws.workspace != 'main'
                AND (
                    t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (
                        SELECT 1 FROM tenant_members tm
                        WHERE tm.tenant = t.name
                            AND tm.user = ?1
                            AND tm.role IN ('owner', 'maintainer')
                    )
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                        WHERE pm.tenant = p.tenant
                            AND pm.project = p.project
                            AND pm.user = ?1
                            AND pm.role IN ('owner', 'maintainer')
                    )
                )
             ORDER BY marked_at DESC, ws.tenant, ws.project, ws.workspace
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ReadyRow> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let author = row.author.unwrap_or_default();
            let author_profile = if author.is_empty() {
                None
            } else {
                user_profile_from_parts(
                    &author,
                    row.display_name,
                    row.handle,
                    None,
                    row.avatar_url,
                    row.email,
                    row.profile_updated_at,
                )
            };
            HomeReadyWorkspace {
                tenant: row.tenant,
                project: row.project,
                workspace: row.workspace,
                head: row.head,
                parent_workspace: row.parent_workspace,
                mergeable: row.mergeable != 0,
                marked_at: row.marked_at,
                author,
                author_profile,
            }
        })
        .collect())
}

async fn home_assigned_issues(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeIssueItem>> {
    ensure_collaboration_schema(db).await?;
    let result = db
        .prepare(
            "SELECT i.tenant, i.project, i.id, i.number, i.title, i.body, i.status, i.state_reason, i.author,
                    i.created_at, i.updated_at, i.closed_at, i.assignees_json, i.milestone,
                    i.workspace, i.issue_type, i.labels_json,
                    u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at
             FROM issues i
             JOIN projects p ON p.tenant = i.tenant AND p.project = i.project
             JOIN tenants t ON t.name = p.tenant
             LEFT JOIN user_profiles me ON me.user = ?1
             LEFT JOIN user_profiles u ON u.user = i.author
             WHERE i.status = 'open'
                AND EXISTS (
                    SELECT 1
                    FROM json_each(i.assignees_json) assignee
                    WHERE LOWER(assignee.value) = LOWER(?1)
                        OR LOWER(assignee.value) = LOWER(COALESCE(me.handle, ''))
                        OR LOWER(assignee.value) = '@' || LOWER(COALESCE(me.handle, ''))
                )
                AND (
                    COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
                    OR t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?1)
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                        WHERE pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?1
                    )
                )
             ORDER BY i.updated_at DESC, i.created_at DESC
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<IssueRow> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| HomeIssueItem {
            tenant: row.tenant.clone(),
            project: row.project.clone(),
            issue: issue_from_row(row),
        })
        .collect())
}

async fn home_mentions(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<HomeMentionItem>> {
    ensure_collaboration_schema(db).await?;
    let Some(profile) = user_profile(db, &principal.user).await? else {
        return Ok(Vec::new());
    };
    let Some(handle) = profile.handle.filter(|value| !value.trim().is_empty()) else {
        return Ok(Vec::new());
    };
    let pattern = format!("%@{}%", handle.to_ascii_lowercase());
    let result = db
        .prepare(
            "SELECT 'issue' AS source, i.tenant, i.project, i.id AS issue_id,
                    i.number AS issue_number, i.title AS issue_title, i.author,
                    u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at,
                    i.body, i.created_at
             FROM issues i
             JOIN projects p ON p.tenant = i.tenant AND p.project = i.project
             JOIN tenants t ON t.name = p.tenant
             LEFT JOIN user_profiles u ON u.user = i.author
             WHERE i.status = 'open'
                AND i.author != ?1
                AND (LOWER(i.title) LIKE ?2 OR LOWER(i.body) LIKE ?2)
                AND (
                    COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
                    OR t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?1)
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                        WHERE pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?1
                    )
                )
             UNION ALL
             SELECT 'comment' AS source, c.tenant, c.project, i.id AS issue_id,
                    i.number AS issue_number, i.title AS issue_title, c.author,
                    u.display_name, u.handle, u.avatar_url, u.email, u.updated_at AS profile_updated_at,
                    c.body, c.created_at
             FROM comments c
             JOIN issues i ON i.tenant = c.tenant AND i.project = c.project AND i.id = c.issue_id
             JOIN projects p ON p.tenant = c.tenant AND p.project = c.project
             JOIN tenants t ON t.name = p.tenant
             LEFT JOIN user_profiles u ON u.user = c.author
             WHERE i.status = 'open'
                AND c.author != ?1
                AND LOWER(c.body) LIKE ?2
                AND (
                    COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
                    OR t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?1)
                    OR EXISTS (
                        SELECT 1 FROM project_members pm
                        WHERE pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?1
                    )
                )
             ORDER BY created_at DESC
             LIMIT ?3",
        )
        .bind(&[
            js_str(&principal.user),
            js_str(&pattern),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<MentionRow> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| HomeMentionItem {
            tenant: row.tenant,
            project: row.project,
            issue_id: row.issue_id,
            issue_number: row.issue_number as u64,
            issue_title: row.issue_title,
            source: row.source,
            author_profile: user_profile_from_parts(
                &row.author,
                row.display_name,
                row.handle,
                None,
                row.avatar_url,
                row.email,
                row.profile_updated_at,
            ),
            author: row.author,
            body: row.body,
            created_at: row.created_at,
        })
        .collect())
}

fn issue_from_row(row: IssueRow) -> Issue {
    let created_at = row.created_at;
    Issue {
        id: row.id,
        number: row.number as u64,
        title: row.title,
        body: row.body,
        state: row.status.clone(),
        status: row.status,
        state_reason: row.state_reason,
        author_profile: user_profile_from_parts(
            &row.author,
            row.display_name,
            row.handle,
            None,
            row.avatar_url,
            row.email,
            row.profile_updated_at,
        ),
        author: row.author,
        assignees: serde_json::from_str(row.assignees_json.as_deref().unwrap_or("[]"))
            .unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_else(|| created_at.clone()),
        created_at,
        closed_at: row.closed_at,
        labels: serde_json::from_str(&row.labels_json).unwrap_or_default(),
        milestone: row.milestone,
        workspace: row.workspace,
        issue_type: row.issue_type,
        locked: false,
        pinned: false,
        comment_count: 0,
    }
}

#[derive(Deserialize)]
struct ReadyRow {
    tenant: String,
    project: String,
    workspace: String,
    head: Option<String>,
    parent_workspace: Option<String>,
    mergeable: i64,
    author: Option<String>,
    marked_at: Option<String>,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    profile_updated_at: Option<String>,
}

#[derive(Deserialize)]
struct IssueRow {
    tenant: String,
    project: String,
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
    labels_json: String,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    profile_updated_at: Option<String>,
}

#[derive(Deserialize)]
struct MentionRow {
    source: String,
    tenant: String,
    project: String,
    issue_id: String,
    issue_number: f64,
    issue_title: String,
    author: String,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    profile_updated_at: Option<String>,
    body: String,
    created_at: String,
}
