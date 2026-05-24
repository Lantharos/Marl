use serde::Serialize;

use super::history::history_entry_from_row;
use super::*;

#[derive(Debug, Clone, Serialize)]
pub struct ReactionSummary {
    pub emoji: String,
    pub content: String,
    pub count: u64,
    pub reacted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceReview {
    pub id: String,
    pub workspace: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_profile: Option<UserProfile>,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    pub head: Option<String>,
    pub submitted_at: String,
}

#[derive(Deserialize)]
struct ReactionRow {
    emoji: String,
    count: f64,
    reacted: f64,
}

#[derive(Deserialize)]
struct ReviewRow {
    id: String,
    workspace: String,
    author: String,
    display_name: Option<String>,
    handle: Option<String>,
    account_tenant: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    profile_updated_at: Option<String>,
    state: String,
    body: Option<String>,
    head: Option<String>,
    submitted_at: String,
}

pub async fn ensure_review_schema(db: &Database) -> Result<()> {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS protocol_reactions (
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            target_kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            emoji TEXT NOT NULL,
            user TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (tenant, project, target_kind, target_id, emoji, user)
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_protocol_reactions_target
         ON protocol_reactions(tenant, project, target_kind, target_id)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE TABLE IF NOT EXISTS workspace_reviews (
            id TEXT PRIMARY KEY,
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            workspace TEXT NOT NULL,
            author TEXT NOT NULL,
            state TEXT NOT NULL,
            body TEXT,
            head TEXT,
            submitted_at TEXT NOT NULL
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_workspace_reviews_scope
         ON workspace_reviews(tenant, project, workspace, submitted_at DESC)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_workspace_reviews_head
         ON workspace_reviews(tenant, project, workspace, head, author, submitted_at DESC)",
    )
    .run()
    .await?;
    Ok(())
}

pub async fn list_reactions(
    db: &Database,
    tenant: &str,
    project: &str,
    target_kind: &str,
    target_id: &str,
    user: Option<&str>,
) -> Result<Vec<ReactionSummary>> {
    ensure_review_schema(db).await?;
    let result = db
        .prepare(
            "SELECT emoji, COUNT(*) AS count,
                    MAX(CASE WHEN user = ?5 THEN 1 ELSE 0 END) AS reacted
             FROM protocol_reactions
             WHERE tenant = ?1 AND project = ?2 AND target_kind = ?3 AND target_id = ?4
             GROUP BY emoji
             ORDER BY emoji",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(target_kind),
            js_str(target_id),
            js_opt(user),
        ])?
        .all()
        .await?;
    let rows: Vec<ReactionRow> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| ReactionSummary {
            content: row.emoji.clone(),
            emoji: row.emoji,
            count: row.count as u64,
            reacted: row.reacted > 0.0,
        })
        .collect())
}

pub async fn add_reaction(
    db: &Database,
    tenant: &str,
    project: &str,
    target_kind: &str,
    target_id: &str,
    user: &str,
    emoji: &str,
) -> Result<Vec<ReactionSummary>> {
    ensure_review_schema(db).await?;
    let created_at = now_rfc3339();
    db.prepare(
        "INSERT INTO protocol_reactions (tenant, project, target_kind, target_id, emoji, user, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(tenant, project, target_kind, target_id, emoji, user)
         DO UPDATE SET created_at = excluded.created_at",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(target_kind),
        js_str(target_id),
        js_str(emoji),
        js_str(user),
        js_str(&created_at),
    ])?
    .run()
    .await?;
    list_reactions(db, tenant, project, target_kind, target_id, Some(user)).await
}

pub async fn delete_reaction(
    db: &Database,
    tenant: &str,
    project: &str,
    target_kind: &str,
    target_id: &str,
    user: &str,
    emoji: &str,
) -> Result<()> {
    ensure_review_schema(db).await?;
    db.prepare(
        "DELETE FROM protocol_reactions
         WHERE tenant = ?1 AND project = ?2 AND target_kind = ?3 AND target_id = ?4 AND emoji = ?5 AND user = ?6",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(target_kind),
        js_str(target_id),
        js_str(emoji),
        js_str(user),
    ])?
    .run()
    .await?;
    Ok(())
}

pub async fn delete_reactions_for_target(
    db: &Database,
    tenant: &str,
    project: &str,
    target_kind: &str,
    target_id: &str,
) -> Result<()> {
    ensure_review_schema(db).await?;
    db.prepare(
        "DELETE FROM protocol_reactions
         WHERE tenant = ?1 AND project = ?2 AND target_kind = ?3 AND target_id = ?4",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(target_kind),
        js_str(target_id),
    ])?
    .run()
    .await?;
    Ok(())
}

pub async fn submit_workspace_review(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    principal: &TokenPrincipal,
    state: &str,
    body: Option<&str>,
    head: Option<&str>,
) -> Result<WorkspaceReview> {
    ensure_review_schema(db).await?;
    let id = format!("review-{}", Uuid::new_v4().simple());
    let submitted_at = now_rfc3339();
    db.prepare(
        "INSERT INTO workspace_reviews (id, tenant, project, workspace, author, state, body, head, submitted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        js_str(workspace),
        js_str(&principal.user),
        js_str(state),
        js_opt(body),
        js_opt(head),
        js_str(&submitted_at),
    ])?
    .run()
    .await?;

    let message = review_history_message(state, workspace, body);
    log_history(
        db, tenant, project, workspace, principal, "review", &message, head, None,
    )
    .await?;
    if state == "approved" {
        db.prepare(
            "UPDATE workspace_states
             SET mergeable = 1
             WHERE tenant = ?1 AND project = ?2 AND workspace = ?3 AND status = 'ready'",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .run()
        .await?;
        recompute_project_stats(db, tenant, project).await?;
    }

    list_workspace_reviews(db, tenant, project, workspace)
        .await?
        .into_iter()
        .find(|review| review.id == id)
        .ok_or_else(|| err("review not found"))
}

pub async fn list_workspace_reviews(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<Vec<WorkspaceReview>> {
    ensure_review_schema(db).await?;
    let result = db
        .prepare(
            "SELECT wr.id, wr.workspace, wr.author, u.display_name, u.handle,
                    (SELECT t.name FROM tenants t WHERE t.owner = wr.author AND t.kind = 'user' ORDER BY t.name LIMIT 1) AS account_tenant,
                    u.avatar_url, u.email, u.updated_at AS profile_updated_at,
                    wr.state, wr.body, wr.head, wr.submitted_at
             FROM workspace_reviews wr
             LEFT JOIN user_profiles u ON u.user = wr.author
             WHERE wr.tenant = ?1 AND wr.project = ?2 AND wr.workspace = ?3
             ORDER BY wr.submitted_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .all()
        .await?;
    let rows: Vec<ReviewRow> = result.results()?;
    Ok(rows.into_iter().map(review_from_row).collect())
}

pub async fn current_workspace_approvals(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
) -> Result<Vec<WorkspaceReview>> {
    ensure_review_schema(db).await?;
    let result = db
        .prepare(
            "WITH latest AS (
                SELECT author, MAX(submitted_at) AS submitted_at
                FROM workspace_reviews
                WHERE tenant = ?1 AND project = ?2 AND workspace = ?3
                  AND ((?4 IS NULL AND head IS NULL) OR head = ?4)
                GROUP BY author
             )
             SELECT wr.id, wr.workspace, wr.author, u.display_name, u.handle,
                    (SELECT t.name FROM tenants t WHERE t.owner = wr.author AND t.kind = 'user' ORDER BY t.name LIMIT 1) AS account_tenant,
                    u.avatar_url, u.email, u.updated_at AS profile_updated_at,
                    wr.state, wr.body, wr.head, wr.submitted_at
             FROM workspace_reviews wr
             JOIN latest ON latest.author = wr.author AND latest.submitted_at = wr.submitted_at
             LEFT JOIN user_profiles u ON u.user = wr.author
             WHERE wr.tenant = ?1 AND wr.project = ?2 AND wr.workspace = ?3 AND wr.state = 'approved'
             ORDER BY wr.submitted_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace), js_opt(head)])?
        .all()
        .await?;
    let rows: Vec<ReviewRow> = result.results()?;
    Ok(rows.into_iter().map(review_from_row).collect())
}

pub async fn latest_workspace_approvals(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<Vec<WorkspaceReview>> {
    ensure_review_schema(db).await?;
    let result = db
        .prepare(
            "WITH latest AS (
                SELECT author, MAX(submitted_at) AS submitted_at
                FROM workspace_reviews
                WHERE tenant = ?1 AND project = ?2 AND workspace = ?3
                GROUP BY author
             )
             SELECT wr.id, wr.workspace, wr.author, u.display_name, u.handle,
                    (SELECT t.name FROM tenants t WHERE t.owner = wr.author AND t.kind = 'user' ORDER BY t.name LIMIT 1) AS account_tenant,
                    u.avatar_url, u.email, u.updated_at AS profile_updated_at,
                    wr.state, wr.body, wr.head, wr.submitted_at
             FROM workspace_reviews wr
             JOIN latest ON latest.author = wr.author AND latest.submitted_at = wr.submitted_at
             LEFT JOIN user_profiles u ON u.user = wr.author
             WHERE wr.tenant = ?1 AND wr.project = ?2 AND wr.workspace = ?3 AND wr.state = 'approved'
             ORDER BY wr.submitted_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .all()
        .await?;
    let rows: Vec<ReviewRow> = result.results()?;
    Ok(rows.into_iter().map(review_from_row).collect())
}

pub async fn stale_workspace_approvals(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
) -> Result<Vec<WorkspaceReview>> {
    let approvals = latest_workspace_approvals(db, tenant, project, workspace).await?;
    Ok(approvals
        .into_iter()
        .filter(|approval| approval.head.as_deref() != head)
        .collect())
}

pub async fn latest_ready_marker(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<Option<HistoryEntry>> {
    let result = db
        .prepare(
            "SELECT h.id, h.kind, h.message, h.author, u.display_name, u.handle, u.avatar_url, u.email, u.updated_at,
                    h.timestamp, h.workspace, h.snapshot_id, h.agent, h.model, h.signature_json
             FROM history h
             LEFT JOIN user_profiles u ON u.user = h.author
             WHERE h.tenant = ?1 AND h.project = ?2 AND h.workspace = ?3 AND h.kind = 'ready'
               AND h.message LIKE 'marked workspace % as ready%'
             ORDER BY h.timestamp DESC
             LIMIT 1",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(workspace)])?
        .first(None)
        .await?;
    Ok(result.map(history_entry_from_row))
}

fn review_from_row(row: ReviewRow) -> WorkspaceReview {
    WorkspaceReview {
        id: row.id,
        workspace: row.workspace,
        author_profile: user_profile_from_parts(
            &row.author,
            row.display_name,
            row.handle,
            row.account_tenant,
            row.avatar_url,
            row.email,
            row.profile_updated_at,
        ),
        author: row.author,
        state: row.state,
        body: row.body,
        head: row.head,
        submitted_at: row.submitted_at,
    }
}

fn review_history_message(state: &str, workspace: &str, body: Option<&str>) -> String {
    let action = match state {
        "approved" => "approved",
        "changes_requested" => "requested changes on",
        _ => "reviewed",
    };
    match body.map(str::trim).filter(|value| !value.is_empty()) {
        Some(body) => format!("{action} workspace {workspace}: {body}"),
        None => format!("{action} workspace {workspace}"),
    }
}
