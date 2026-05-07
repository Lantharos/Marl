use super::*;
use sty_protocol::{
    ProfileContributionDay, ProfileStats, ProfileTenant, ProjectDiscoveryItem, ProjectPinRequest,
    ProjectStats, UserProfilePage,
};

const PROFILE_PIN_LIMIT: usize = 6;

pub async fn user_profile_page(
    db: &Database,
    tenant: &str,
    viewer: Option<&str>,
) -> Result<Option<UserProfilePage>> {
    ensure_collaboration_schema(db).await?;
    ensure_profile_schema(db).await?;
    let Some(owner) = user_tenant_owner(db, tenant).await? else {
        return Ok(None);
    };
    let Some(profile) = user_profile(db, &owner).await? else {
        return Ok(None);
    };
    let projects = user_tenant_project_cards(db, tenant, viewer, 200).await?;
    let candidates = user_public_project_cards(db, &owner, 200).await?;
    let pinned_projects = pinned_project_cards(db, &owner, &candidates).await?;
    let default_pins = candidates.iter().take(PROFILE_PIN_LIMIT).cloned().collect();
    let pinned_projects = if pinned_projects.is_empty() {
        default_pins
    } else {
        pinned_projects
    };
    let tenants = profile_tenants(db, &owner, tenant).await?;
    let contributions = profile_contributions(db, &owner).await?;
    let contribution_count = contributions.iter().map(|day| day.count).sum();
    let public_project_count = projects
        .iter()
        .filter(|project| project.tenant == tenant)
        .count() as u64;
    let tenant_count = tenants.len() as u64;
    Ok(Some(UserProfilePage {
        tenant: tenant.to_string(),
        owner: owner.clone(),
        profile,
        is_self: viewer.is_some_and(|viewer| viewer == owner),
        stats: ProfileStats {
            public_project_count,
            contribution_count,
            tenant_count,
        },
        projects,
        pinned_projects,
        pin_candidates: candidates,
        following: profile_following_project_cards(db, &owner, 100).await?,
        tenants,
        contributions,
        activity: profile_activity(db, &owner, 30).await?,
    }))
}

pub async fn user_profile_page_by_handle(
    db: &Database,
    handle: &str,
    viewer: Option<&str>,
) -> Result<Option<UserProfilePage>> {
    #[derive(Deserialize)]
    struct Row {
        user: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT user FROM user_profiles WHERE lower(handle) = lower(?1)")
        .bind(&[js_str(handle)])?
        .first(None)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    let Some(tenant) = user_account_tenant(db, &row.user).await? else {
        return Ok(None);
    };
    user_profile_page(db, &tenant, viewer).await
}

pub async fn set_user_profile_pins(
    db: &Database,
    tenant: &str,
    principal: &TokenPrincipal,
    pins: Vec<ProjectPinRequest>,
) -> Result<UserProfilePage> {
    ensure_collaboration_schema(db).await?;
    ensure_profile_schema(db).await?;
    let owner = user_tenant_owner(db, tenant)
        .await?
        .ok_or_else(|| err("profile not found"))?;
    if owner != principal.user {
        return Err(err("profile control denied"));
    }
    if pins.len() > PROFILE_PIN_LIMIT {
        return Err(err("too many pinned projects"));
    }
    let candidates = user_public_project_cards(db, &owner, 500).await?;
    for pin in &pins {
        validate_segment(&pin.tenant).map_err(|error| err(error.to_string()))?;
        validate_segment(&pin.project).map_err(|error| err(error.to_string()))?;
        if !candidates
            .iter()
            .any(|project| project.tenant == pin.tenant && project.project == pin.project)
        {
            return Err(err("project cannot be pinned"));
        }
    }
    db.prepare("DELETE FROM user_pinned_projects WHERE user = ?1")
        .bind(&[js_str(&owner)])?
        .run()
        .await?;
    let now = now_rfc3339();
    for (index, pin) in pins.iter().enumerate() {
        db.prepare(
            "INSERT INTO user_pinned_projects (user, tenant, project, position, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(&[
            js_str(&owner),
            js_str(&pin.tenant),
            js_str(&pin.project),
            wasm_bindgen::JsValue::from_f64(index as f64),
            js_str(&now),
        ])?
        .run()
        .await?;
    }
    user_profile_page(db, tenant, Some(&principal.user))
        .await?
        .ok_or_else(|| err("profile not found"))
}

async fn ensure_profile_schema(db: &Database) -> Result<()> {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS user_pinned_projects (
            user TEXT NOT NULL,
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            position INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (user, tenant, project)
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_user_pinned_projects_user_position
         ON user_pinned_projects(user, position)",
    )
    .run()
    .await?;
    Ok(())
}

async fn user_tenant_owner(db: &Database, tenant: &str) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        owner: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT owner FROM tenants WHERE name = ?1 AND kind = 'user'")
        .bind(&[js_str(tenant)])?
        .first(None)
        .await?;
    Ok(row.map(|row| row.owner))
}

async fn user_public_project_cards(
    db: &Database,
    user: &str,
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
                    (SELECT MAX(timestamp) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project) AS last_activity_at,
                    (SELECT data_json FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release' ORDER BY pi.created_at DESC LIMIT 1) AS latest_release_json,
                    (SELECT COUNT(*) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project AND h.author = ?1) AS user_history_count
             FROM projects p
             JOIN tenants t ON t.name = p.tenant
             LEFT JOIN project_stats ps ON ps.tenant = p.tenant AND ps.project = p.project
             WHERE COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             AND (
                t.owner = ?1
                OR p.owner = ?1
                OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?1)
                OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?1)
                OR EXISTS (SELECT 1 FROM history h WHERE h.tenant = p.tenant AND h.project = p.project AND h.author = ?1)
             )
             ORDER BY user_history_count DESC, last_activity_at DESC, p.tenant, COALESCE(p.folder, ''), p.project
             LIMIT ?2",
        )
        .bind(&[
            js_str(user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ProfileProjectCardRow> = result.results()?;
    Ok(rows.into_iter().map(profile_project_card_item).collect())
}

async fn user_tenant_project_cards(
    db: &Database,
    tenant: &str,
    viewer: Option<&str>,
    limit: usize,
) -> Result<Vec<ProjectDiscoveryItem>> {
    let viewer = viewer.unwrap_or_default();
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.owner,
                    p.folder,
                    COALESCE(ps.workspace_count, 0) AS workspace_count,
                    COALESCE(ps.open_issue_count, 0) AS open_issue_count,
                    COALESCE(ps.ready_count, 0) AS ready_count,
                    COALESCE(ps.release_count, 0) AS release_count,
                    COALESCE(ps.history_count, 0) AS history_count,
                    (SELECT MAX(timestamp) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project) AS last_activity_at,
                    (SELECT data_json FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release' ORDER BY pi.created_at DESC LIMIT 1) AS latest_release_json
             FROM projects p
             JOIN tenants t ON t.name = p.tenant
             LEFT JOIN project_stats ps ON ps.tenant = p.tenant AND ps.project = p.project
             WHERE p.tenant = ?1
             AND (
                COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
                OR (?2 != '' AND (
                    t.owner = ?2
                    OR p.owner = ?2
                    OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?2)
                    OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?2)
                ))
             )
             ORDER BY last_activity_at DESC, COALESCE(p.folder, ''), p.project
             LIMIT ?3",
        )
        .bind(&[
            js_str(tenant),
            js_str(viewer),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ProfileProjectCardRow> = result.results()?;
    Ok(rows.into_iter().map(profile_project_card_item).collect())
}

async fn pinned_project_cards(
    db: &Database,
    user: &str,
    candidates: &[ProjectDiscoveryItem],
) -> Result<Vec<ProjectDiscoveryItem>> {
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
    }
    let result = db
        .prepare(
            "SELECT tenant, project FROM user_pinned_projects
             WHERE user = ?1
             ORDER BY position, updated_at DESC",
        )
        .bind(&[js_str(user)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            candidates
                .iter()
                .find(|project| project.tenant == row.tenant && project.project == row.project)
                .cloned()
        })
        .collect())
}

async fn profile_following_project_cards(
    db: &Database,
    user: &str,
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
                    (SELECT MAX(timestamp) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project) AS last_activity_at,
                    (SELECT data_json FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release' ORDER BY pi.created_at DESC LIMIT 1) AS latest_release_json
             FROM project_follows f
             JOIN projects p ON p.tenant = f.tenant AND p.project = f.project
             LEFT JOIN project_stats ps ON ps.tenant = p.tenant AND ps.project = p.project
             WHERE f.user = ?1
             AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             ORDER BY f.created_at DESC, last_activity_at DESC, p.tenant, p.project
             LIMIT ?2",
        )
        .bind(&[
            js_str(user),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?;
    let rows: Vec<ProfileProjectCardRow> = result.results()?;
    Ok(rows.into_iter().map(profile_project_card_item).collect())
}

async fn profile_tenants(db: &Database, user: &str, account_tenant: &str) -> Result<Vec<ProfileTenant>> {
    let result = db
        .prepare(
            "SELECT t.name, t.kind, COUNT(DISTINCT p.project) AS public_project_count
             FROM tenants t
             LEFT JOIN projects p ON p.tenant = t.name
                AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
                AND (
                    t.owner = ?1
                    OR p.owner = ?1
                    OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?1)
                    OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?1)
                    OR EXISTS (SELECT 1 FROM history h WHERE h.tenant = p.tenant AND h.project = p.project AND h.author = ?1)
                )
             WHERE t.name != ?2
             AND (t.owner = ?1
                OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?1)
                OR EXISTS (
                    SELECT 1 FROM projects ip
                    WHERE ip.tenant = t.name
                    AND COALESCE(json_extract(ip.settings_json, '$.visibility'), 'private') = 'public'
                    AND (
                        ip.owner = ?1
                        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.tenant = ip.tenant AND pm.project = ip.project AND pm.user = ?1)
                        OR EXISTS (SELECT 1 FROM history h WHERE h.tenant = ip.tenant AND h.project = ip.project AND h.author = ?1)
                    )
                ))
             GROUP BY t.name, t.kind
             HAVING COUNT(DISTINCT p.project) > 0
             ORDER BY public_project_count DESC, t.name",
        )
        .bind(&[js_str(user), js_str(account_tenant)])?
        .all()
        .await?;
    #[derive(Deserialize)]
    struct Row {
        name: String,
        kind: String,
        public_project_count: f64,
    }
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| ProfileTenant {
            name: row.name,
            kind: row.kind,
            public_project_count: row.public_project_count as u64,
        })
        .collect())
}

async fn profile_contributions(db: &Database, user: &str) -> Result<Vec<ProfileContributionDay>> {
    #[derive(Deserialize)]
    struct Row {
        date: String,
        count: f64,
    }
    let result = db
        .prepare(
            "SELECT substr(h.timestamp, 1, 10) AS date, COUNT(*) AS count
             FROM history h
             JOIN projects p ON p.tenant = h.tenant AND p.project = h.project
             WHERE h.author = ?1
             AND COALESCE(json_extract(p.settings_json, '$.visibility'), 'private') = 'public'
             AND h.timestamp >= datetime('now', '-1 year')
             GROUP BY substr(h.timestamp, 1, 10)
             ORDER BY date",
        )
        .bind(&[js_str(user)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| ProfileContributionDay {
            date: row.date,
            count: row.count as u64,
        })
        .collect())
}

#[derive(Deserialize)]
struct ProfileProjectCardRow {
    tenant: String,
    project: String,
    owner: String,
    folder: Option<String>,
    workspace_count: f64,
    open_issue_count: f64,
    ready_count: f64,
    release_count: f64,
    history_count: f64,
    last_activity_at: Option<String>,
    latest_release_json: Option<String>,
}

fn profile_project_card_item(row: ProfileProjectCardRow) -> ProjectDiscoveryItem {
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
        },
        last_activity_at: row.last_activity_at,
        latest_release: row
            .latest_release_json
            .and_then(|value| serde_json::from_str(&value).ok()),
    }
}
