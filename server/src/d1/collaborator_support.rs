use super::*;
use sty_protocol::{AccessResponse, Collaborator};

pub(super) const ROLE_OWNER: &str = "owner";
pub(super) const ROLE_MAINTAINER: &str = "maintainer";
pub(super) const ROLE_CONTRIBUTOR: &str = "contributor";
pub(super) const ROLE_VIEWER: &str = "viewer";

pub fn normalize_collaborator_role(role: &str) -> Result<String> {
    let role = role.trim().to_ascii_lowercase();
    match role.as_str() {
        ROLE_MAINTAINER | ROLE_CONTRIBUTOR | ROLE_VIEWER => Ok(role),
        ROLE_OWNER => Err(err("owner is not an assignable collaborator role")),
        _ => Err(err("invalid collaborator role")),
    }
}

pub fn role_rank(role: &str) -> u8 {
    match role {
        ROLE_OWNER => 4,
        ROLE_MAINTAINER => 3,
        ROLE_CONTRIBUTOR => 2,
        ROLE_VIEWER => 1,
        _ => 0,
    }
}

pub fn role_allows(role: Option<&str>, minimum: &str) -> bool {
    role.map(role_rank).unwrap_or(0) >= role_rank(minimum)
}

pub async fn ensure_collaboration_schema(db: &Database) -> Result<()> {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS tenant_members (
            tenant TEXT NOT NULL,
            user TEXT NOT NULL,
            role TEXT NOT NULL,
            added_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (tenant, user)
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user, tenant)",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE TABLE IF NOT EXISTS project_members (
            tenant TEXT NOT NULL,
            project TEXT NOT NULL,
            user TEXT NOT NULL,
            role TEXT NOT NULL,
            added_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (tenant, project, user)
        )",
    )
    .run()
    .await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user, tenant, project)")
        .run()
        .await?;
    db.prepare(
        "INSERT OR IGNORE INTO tenant_members (tenant, user, role, added_by, created_at, updated_at)
         SELECT tenants.name, json_each.value, 'maintainer', tenants.owner, ?1, ?1
         FROM tenants, json_each(tenants.members_json)
         WHERE json_each.value != tenants.owner",
    )
    .bind(&[js_str(&now_rfc3339())])?
    .run()
    .await?;
    Ok(())
}

pub async fn tenant_effective_role(
    db: &Database,
    tenant: &str,
    user: &str,
) -> Result<Option<String>> {
    ensure_collaboration_schema(db).await?;
    if user_account_tenant(db, user)
        .await?
        .as_deref()
        .is_some_and(|account_tenant| account_tenant == tenant)
    {
        ensure_account_tenant(db, user).await?;
        return Ok(Some(ROLE_OWNER.to_string()));
    }

    #[derive(Deserialize)]
    struct Row {
        owner: String,
        role: Option<String>,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT t.owner, tm.role
             FROM tenants t
             LEFT JOIN tenant_members tm ON tm.tenant = t.name AND tm.user = ?2
             WHERE t.name = ?1",
        )
        .bind(&[js_str(tenant), js_str(user)])?
        .first(None)
        .await?;
    Ok(match row {
        Some(row) if row.owner == user => Some(ROLE_OWNER.to_string()),
        Some(row) => row.role,
        None => None,
    })
}

pub async fn project_effective_role(
    db: &Database,
    tenant: &str,
    project: &str,
    user: &str,
) -> Result<Option<String>> {
    ensure_collaboration_schema(db).await?;
    if let Some(role) = project_api_key_role(db, tenant, project, user).await? {
        return Ok(Some(role));
    }
    #[derive(Deserialize)]
    struct Row {
        owner: String,
        role: Option<String>,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT p.owner, pm.role
             FROM projects p
             LEFT JOIN project_members pm
                ON pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?3
             WHERE p.tenant = ?1 AND p.project = ?2",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(user)])?
        .first(None)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    let mut role = if row.owner == user {
        Some(ROLE_OWNER.to_string())
    } else {
        row.role
    };
    if let Some(tenant_role) = tenant_effective_role(db, tenant, user).await? {
        if role_rank(&tenant_role) > role.as_deref().map(role_rank).unwrap_or(0) {
            role = Some(tenant_role);
        }
    }
    Ok(role)
}

pub async fn project_role_allows(
    db: &Database,
    tenant: &str,
    project: &str,
    user: &str,
    minimum: &str,
) -> Result<bool> {
    Ok(role_allows(
        project_effective_role(db, tenant, project, user)
            .await?
            .as_deref(),
        minimum,
    ))
}

pub async fn project_access_response(
    db: &Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
    public_visible: bool,
) -> Result<AccessResponse> {
    let role = match user {
        Some(user) => project_effective_role(db, tenant, project, user).await?,
        None => None,
    };
    let archive = project_archive(db, tenant, project).await?;
    let (archived_at, archived_by, archived_by_profile) = match archive {
        Some((archived_at, archived_by)) => {
            let profile = user_profile(db, &archived_by).await?;
            (Some(archived_at), Some(archived_by), profile)
        }
        None => (None, None, None),
    };
    let archived = archived_at.is_some();
    let can_read = role.is_some() || public_visible;
    Ok(AccessResponse {
        source: role
            .as_ref()
            .map(|_| "collaborator".to_string())
            .or_else(|| public_visible.then(|| "public".to_string())),
        archived,
        archived_at,
        archived_by,
        archived_by_profile,
        can_write: !archived && role_allows(role.as_deref(), ROLE_CONTRIBUTOR),
        can_maintain: role_allows(role.as_deref(), ROLE_MAINTAINER),
        can_admin: role_allows(role.as_deref(), ROLE_OWNER),
        role,
        can_read,
    })
}

pub async fn search_users(db: &Database, query: &str, limit: usize) -> Result<Vec<UserProfile>> {
    let trimmed = query.trim().trim_start_matches('@').to_ascii_lowercase();
    let pattern = format!("%{trimmed}%");
    #[derive(Deserialize)]
    struct Row {
        user: String,
        display_name: String,
        handle: Option<String>,
        avatar_url: Option<String>,
        email: Option<String>,
        updated_at: String,
    }
    let result = if trimmed.is_empty() {
        db.prepare(
            "SELECT user, display_name, handle, avatar_url, email, updated_at
             FROM user_profiles
             ORDER BY updated_at DESC, display_name
             LIMIT ?1",
        )
        .bind(&[wasm_bindgen::JsValue::from_f64(limit as f64)])?
        .all()
        .await?
    } else {
        db.prepare(
            "SELECT user, display_name, handle, avatar_url, email, updated_at
             FROM user_profiles
             WHERE LOWER(COALESCE(handle, '')) LIKE ?1
                OR LOWER(display_name) LIKE ?1
                OR LOWER(COALESCE(email, '')) LIKE ?1
                OR LOWER(user) = ?2
             ORDER BY CASE WHEN LOWER(COALESCE(handle, '')) = ?2 THEN 0 ELSE 1 END, display_name
             LIMIT ?3",
        )
        .bind(&[
            js_str(&pattern),
            js_str(&trimmed),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?
    };
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| UserProfile {
            user: row.user,
            display_name: row.display_name,
            handle: row.handle,
            avatar_url: row.avatar_url,
            email: row.email,
            updated_at: Some(row.updated_at),
        })
        .collect())
}

pub(super) async fn resolve_user(db: &Database, input: &str) -> Result<String> {
    let value = input.trim().trim_start_matches('@');
    if value.is_empty() {
        return Err(err("user is required"));
    }
    #[derive(Deserialize)]
    struct Row {
        user: String,
    }
    let lower = value.to_ascii_lowercase();
    let row: Option<Row> = db
        .prepare(
            "SELECT user FROM user_profiles
             WHERE user = ?1 OR LOWER(COALESCE(handle, '')) = ?2
             ORDER BY CASE WHEN LOWER(COALESCE(handle, '')) = ?2 THEN 0 ELSE 1 END
             LIMIT 1",
        )
        .bind(&[js_str(value), js_str(&lower)])?
        .first(None)
        .await?;
    row.map(|row| row.user)
        .ok_or_else(|| err("user not found; they need to sign in once first"))
}

pub(super) async fn tenant_owner(db: &Database, tenant: &str) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        owner: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT owner FROM tenants WHERE name = ?1")
        .bind(&[js_str(tenant)])?
        .first(None)
        .await?;
    Ok(row.map(|row| row.owner))
}

pub(super) async fn project_owner(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        owner: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT owner FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|row| row.owner))
}

pub(super) async fn collaborator(
    db: &Database,
    user: String,
    role: &str,
    source: &str,
    added_by: Option<String>,
    added_at: Option<String>,
    updated_at: Option<String>,
    removable: bool,
) -> Result<Collaborator> {
    Ok(Collaborator {
        profile: user_profile(db, &user).await?,
        user,
        role: role.to_string(),
        source: source.to_string(),
        added_by,
        added_at,
        updated_at,
        direct: removable,
        removable,
    })
}

pub(super) fn insert_highest(
    items: &mut std::collections::HashMap<String, Collaborator>,
    item: Collaborator,
) {
    let rank = role_rank(&item.role);
    match items.get(&item.user) {
        Some(existing) if role_rank(&existing.role) > rank => {}
        Some(existing) if role_rank(&existing.role) == rank && existing.source == "owner" => {}
        _ => {
            items.insert(item.user.clone(), item);
        }
    }
}

pub(super) async fn rewrite_tenant_members_json(db: &Database, tenant: &str) -> Result<()> {
    #[derive(Deserialize)]
    struct Row {
        user: String,
    }
    let result = db
        .prepare("SELECT user FROM tenant_members WHERE tenant = ?1 ORDER BY user")
        .bind(&[js_str(tenant)])?
        .all()
        .await?;
    let mut members = result
        .results::<Row>()?
        .into_iter()
        .map(|row| row.user)
        .collect::<Vec<_>>();
    if let Some(owner) = tenant_owner(db, tenant).await? {
        if !members.iter().any(|user| user == &owner) {
            members.insert(0, owner);
        }
    }
    let json = serde_json::to_string(&members).map_err(|error| err(error.to_string()))?;
    db.prepare("UPDATE tenants SET members_json = ?2 WHERE name = ?1")
        .bind(&[js_str(tenant), js_str(&json)])?
        .run()
        .await?;
    Ok(())
}
