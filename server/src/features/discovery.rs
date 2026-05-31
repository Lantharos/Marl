use super::*;
use futures_util::future::{try_join_all, try_join3};
use sty_protocol::{ProjectDiscoveryItem, ProjectReleaseFeedItem};

pub async fn dashboard_project_cards(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<ProjectDiscoveryItem>> {
    ensure_collaboration_schema(db).await?;
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.owner,
                    p.folder,
                    COALESCE(ps.workspace_count, 0) AS workspace_count,
                    COALESCE(ps.open_issue_count, 0) AS open_issue_count,
                    COALESCE(ps.ready_count, 0) AS ready_count,
                    COALESCE(ps.release_count, 0) AS release_count,
                    COALESCE(ps.history_count, 0) AS history_count,
                    COALESCE(ps.leaf_count, 0) AS leaf_count,
                    (SELECT MAX(timestamp) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project AND h.kind IN ('ready', 'merge', 'ship')) AS last_activity_at,
                    (SELECT data_json FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release' ORDER BY pi.created_at DESC LIMIT 1) AS latest_release_json
             FROM projects p
             JOIN tenants t ON t.name = p.tenant
             LEFT JOIN project_stats ps ON ps.tenant = p.tenant AND ps.project = p.project
             WHERE (t.owner = ?1
                OR p.owner = ?1
                OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?1)
                OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?1))
             ORDER BY last_activity_at DESC, p.tenant, COALESCE(p.folder, ''), p.project
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ProjectCardRow> = result.results()?;
    visible_project_card_items(db, rows, Some(&principal.user)).await
}

pub async fn followed_project_cards(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<ProjectDiscoveryItem>> {
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.owner,
                    p.folder,
                    COALESCE(ps.workspace_count, 0) AS workspace_count,
                    COALESCE(ps.open_issue_count, 0) AS open_issue_count,
                    COALESCE(ps.ready_count, 0) AS ready_count,
                    COALESCE(ps.release_count, 0) AS release_count,
                    COALESCE(ps.history_count, 0) AS history_count,
                    COALESCE(ps.leaf_count, 0) AS leaf_count,
                    (SELECT MAX(timestamp) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project AND h.kind IN ('ready', 'merge', 'ship')) AS last_activity_at,
                    (SELECT data_json FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release' ORDER BY pi.created_at DESC LIMIT 1) AS latest_release_json
             FROM project_follows f
             JOIN projects p ON p.tenant = f.tenant AND p.project = f.project
             LEFT JOIN project_stats ps ON ps.tenant = p.tenant AND ps.project = p.project
             WHERE f.user = ?1
             AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             ORDER BY f.created_at DESC
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ProjectCardRow> = result.results()?;
    visible_project_card_items(db, rows, Some(&principal.user)).await
}

pub async fn public_project_cards(
    db: &Database,
    query: &str,
    limit: usize,
) -> Result<Vec<ProjectDiscoveryItem>> {
    let trimmed = query.trim().to_ascii_lowercase();
    let pattern = format!("%{}%", trimmed);
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.owner,
                    p.folder,
                    COALESCE(ps.workspace_count, 0) AS workspace_count,
                    COALESCE(ps.open_issue_count, 0) AS open_issue_count,
                    COALESCE(ps.ready_count, 0) AS ready_count,
                    COALESCE(ps.release_count, 0) AS release_count,
                    COALESCE(ps.history_count, 0) AS history_count,
                    COALESCE(ps.leaf_count, 0) AS leaf_count,
                    (SELECT MAX(timestamp) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project AND h.kind IN ('ready', 'merge', 'ship')) AS last_activity_at,
                    (SELECT data_json FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release' ORDER BY pi.created_at DESC LIMIT 1) AS latest_release_json
             FROM projects p
             LEFT JOIN project_stats ps ON ps.tenant = p.tenant AND ps.project = p.project
             WHERE COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             AND (?1 = '' OR LOWER(p.tenant || '/' || COALESCE(p.folder || '/', '') || p.project) LIKE ?2)
             ORDER BY last_activity_at DESC, p.tenant, COALESCE(p.folder, ''), p.project
             LIMIT ?3",
        )
        .bind(&[
            js_str(&trimmed),
            js_str(&pattern),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ProjectCardRow> = result.results()?;
    visible_project_card_items(db, rows, None).await
}

pub async fn popular_public_project_cards(
    db: &Database,
    limit: usize,
) -> Result<Vec<ProjectDiscoveryItem>> {
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.owner,
                    p.folder,
                    COALESCE(ps.workspace_count, 0) AS workspace_count,
                    COALESCE(ps.open_issue_count, 0) AS open_issue_count,
                    COALESCE(ps.ready_count, 0) AS ready_count,
                    COALESCE(ps.release_count, 0) AS release_count,
                    COALESCE(ps.history_count, 0) AS history_count,
                    COALESCE(ps.leaf_count, 0) AS leaf_count,
                    (SELECT MAX(timestamp) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project) AS last_activity_at,
                    (SELECT data_json FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release' ORDER BY pi.created_at DESC LIMIT 1) AS latest_release_json,
                    (
                        COUNT(DISTINCT f.user) * 10
                        + COALESCE(ps.ready_count, 0) * 5
                        + COALESCE(ps.release_count, 0) * 4
                        + COALESCE(ps.open_issue_count, 0) * 2
                        + COALESCE(ps.workspace_count, 0)
                        + MIN(COALESCE(ps.history_count, 0), 100) / 10
                        + (
                            SELECT COUNT(*) * 3
                            FROM history h
                            WHERE h.tenant = p.tenant
                            AND h.project = p.project
                            AND h.timestamp >= datetime('now', '-30 days')
                        )
                    ) AS popularity_score
             FROM projects p
             LEFT JOIN project_stats ps ON ps.tenant = p.tenant AND ps.project = p.project
             LEFT JOIN project_follows f ON f.tenant = p.tenant AND f.project = p.project
             WHERE COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             GROUP BY p.tenant, p.project
             ORDER BY popularity_score DESC, last_activity_at DESC, p.tenant, COALESCE(p.folder, ''), p.project
             LIMIT ?1",
        )
        .bind(&[wasm_bindgen::JsValue::from_f64(limit as f64)])?
        .all()
        .await?;
    let rows: Vec<ProjectCardRow> = result.results()?;
    visible_project_card_items(db, rows, None).await
}

pub async fn tenant_public_project_cards(
    db: &Database,
    tenant: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<ProjectDiscoveryItem>> {
    let trimmed = query.trim().to_ascii_lowercase();
    let pattern = format!("%{}%", trimmed);
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.owner,
                    p.folder,
                    COALESCE(ps.workspace_count, 0) AS workspace_count,
                    COALESCE(ps.open_issue_count, 0) AS open_issue_count,
                    COALESCE(ps.ready_count, 0) AS ready_count,
                    COALESCE(ps.release_count, 0) AS release_count,
                    COALESCE(ps.history_count, 0) AS history_count,
                    COALESCE(ps.leaf_count, 0) AS leaf_count,
                    (SELECT MAX(timestamp) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project AND h.kind IN ('ready', 'merge', 'ship')) AS last_activity_at,
                    (SELECT data_json FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release' ORDER BY pi.created_at DESC LIMIT 1) AS latest_release_json
             FROM projects p
             LEFT JOIN project_stats ps ON ps.tenant = p.tenant AND ps.project = p.project
             WHERE p.tenant = ?1
             AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             AND (?2 = '' OR LOWER(p.project) LIKE ?3 OR LOWER(COALESCE(p.folder, '')) LIKE ?3 OR LOWER(p.tenant || '/' || COALESCE(p.folder || '/', '') || p.project) LIKE ?3)
             ORDER BY last_activity_at DESC, COALESCE(p.folder, ''), p.project
             LIMIT ?4",
        )
        .bind(&[
            js_str(tenant),
            js_str(&trimmed),
            js_str(&pattern),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ProjectCardRow> = result.results()?;
    visible_project_card_items(db, rows, None).await
}

pub async fn tenant_project_cards(
    db: &Database,
    tenant: &str,
    query: &str,
    user: Option<&str>,
    limit: usize,
) -> Result<Vec<ProjectDiscoveryItem>> {
    let trimmed = query.trim().to_ascii_lowercase();
    let pattern = format!("%{}%", trimmed);
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.owner,
                    p.folder,
                    COALESCE(ps.workspace_count, 0) AS workspace_count,
                    COALESCE(ps.open_issue_count, 0) AS open_issue_count,
                    COALESCE(ps.ready_count, 0) AS ready_count,
                    COALESCE(ps.release_count, 0) AS release_count,
                    COALESCE(ps.history_count, 0) AS history_count,
                    COALESCE(ps.leaf_count, 0) AS leaf_count,
                    (SELECT MAX(timestamp) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project AND h.kind IN ('ready', 'merge', 'ship')) AS last_activity_at,
                    (SELECT data_json FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release' ORDER BY pi.created_at DESC LIMIT 1) AS latest_release_json
             FROM projects p
             LEFT JOIN project_stats ps ON ps.tenant = p.tenant AND ps.project = p.project
             WHERE p.tenant = ?1
             AND (?2 = '' OR LOWER(p.project) LIKE ?3 OR LOWER(COALESCE(p.folder, '')) LIKE ?3 OR LOWER(p.tenant || '/' || COALESCE(p.folder || '/', '') || p.project) LIKE ?3)
             ORDER BY last_activity_at DESC, COALESCE(p.folder, ''), p.project
             LIMIT ?4",
        )
        .bind(&[
            js_str(tenant),
            js_str(&trimmed),
            js_str(&pattern),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ProjectCardRow> = result.results()?;
    visible_project_card_items(db, rows, user).await
}

pub async fn followed_release_feed(
    db: &Database,
    principal: &TokenPrincipal,
    limit: usize,
) -> Result<Vec<ProjectReleaseFeedItem>> {
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.owner, pi.data_json AS release_json, pi.created_at AS released_at
             FROM project_follows f
             JOIN projects p ON p.tenant = f.tenant AND p.project = f.project
             JOIN protocol_items pi ON pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release'
             WHERE f.user = ?1
             AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             ORDER BY pi.created_at DESC
             LIMIT ?2",
        )
        .bind(&[
            js_str(&principal.user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ReleaseRow> = result.results()?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            serde_json::from_str(&row.release_json)
                .ok()
                .map(|release| ProjectReleaseFeedItem {
                    tenant: row.tenant,
                    project: row.project,
                    owner: row.owner,
                    release,
                    released_at: row.released_at,
                })
        })
        .collect())
}

#[derive(Deserialize)]
struct ProjectCardRow {
    tenant: String,
    project: String,
    owner: String,
    folder: Option<String>,
    workspace_count: f64,
    open_issue_count: f64,
    ready_count: f64,
    release_count: f64,
    history_count: f64,
    leaf_count: f64,
    last_activity_at: Option<String>,
    latest_release_json: Option<String>,
}

#[derive(Deserialize)]
struct ReleaseRow {
    tenant: String,
    project: String,
    owner: String,
    release_json: String,
    released_at: String,
}

async fn visible_project_card_items(
    db: &Database,
    rows: Vec<ProjectCardRow>,
    user: Option<&str>,
) -> Result<Vec<ProjectDiscoveryItem>> {
    let mut items = try_join_all(rows.into_iter().map(|row| async move {
        let tenant = row.tenant.clone();
        let project = row.project.clone();
        let mut item = project_card_item(row);
        let ((workspace_count, ready_count), history_count, last_activity_at) = try_join3(
            visible_workspace_counts(db, &tenant, &project, user),
            visible_history_count(db, &tenant, &project, user),
            visible_history_last_activity(db, &tenant, &project, user),
        )
        .await?;
        item.stats.workspace_count = workspace_count;
        item.stats.ready_count = ready_count;
        item.stats.history_count = history_count;
        item.last_activity_at = last_activity_at;
        Ok::<ProjectDiscoveryItem, Error>(item)
    }))
    .await?;
    items.sort_by(|a, b| {
        b.last_activity_at
            .cmp(&a.last_activity_at)
            .then_with(|| a.tenant.cmp(&b.tenant))
            .then_with(|| a.folder.cmp(&b.folder))
            .then_with(|| a.project.cmp(&b.project))
    });
    Ok(items)
}

fn project_card_item(row: ProjectCardRow) -> ProjectDiscoveryItem {
    ProjectDiscoveryItem {
        tenant: row.tenant,
        project: row.project,
        owner: row.owner,
        folder: row.folder,
        stats: ProjectStats {
            workspace_count: row.workspace_count as u64,
            open_issue_count: row.open_issue_count as u64,
            ready_count: row.ready_count as u64,
            release_count: row.release_count as u64,
            history_count: row.history_count as u64,
            leaf_count: row.leaf_count as u64,
        },
        last_activity_at: row.last_activity_at,
        latest_release: row
            .latest_release_json
            .and_then(|value| serde_json::from_str(&value).ok()),
    }
}
