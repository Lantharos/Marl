use super::*;
pub async fn project_visibility(
    db: &D1Database,
    tenant: &str,
    project: &str,
) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        settings_json: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT settings_json FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    let visibility = row.map(|r| {
        serde_json::from_str::<ProjectSettings>(&r.settings_json)
            .map(|s| s.visibility)
            .unwrap_or_else(|_| "private".to_string())
    });
    Ok(visibility)
}

pub async fn project_settings(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: Option<&TokenPrincipal>,
) -> Result<ProjectSettings> {
    #[derive(Deserialize)]
    struct Row {
        settings_json: String,
        archived_at: Option<String>,
        archived_by: Option<String>,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT settings_json, archived_at, archived_by
             FROM projects
             WHERE tenant = ?1 AND project = ?2",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;

    let (settings_json, archived_at, archived_by) = match row {
        Some(r) => (r.settings_json, r.archived_at, r.archived_by),
        None => {
            return Ok(ProjectSettings {
                visibility: "private".to_string(),
                follower_count: 0,
                is_following: false,
                public_releases: false,
                archived_at: None,
                archived_by: None,
                archived_by_profile: None,
                default_workspace: "main".to_string(),
                navbar_items: vec![],
                panels: vec![],
            });
        }
    };

    let mut settings: ProjectSettings =
        serde_json::from_str(&settings_json).map_err(|e| err(e.to_string()))?;

    settings.follower_count = follower_count(db, tenant, project).await?;
    settings.is_following = is_following(db, tenant, project, principal).await?;
    settings.archived_by_profile = match archived_by.as_deref() {
        Some(user) => user_profile(db, user).await?,
        None => None,
    };
    settings.archived_at = archived_at;
    settings.archived_by = archived_by;

    Ok(settings)
}

pub async fn project_public_releases(db: &D1Database, tenant: &str, project: &str) -> Result<bool> {
    Ok(project_settings(db, tenant, project, None)
        .await?
        .public_releases)
}

pub async fn project_archive(
    db: &D1Database,
    tenant: &str,
    project: &str,
) -> Result<Option<(String, String)>> {
    #[derive(Deserialize)]
    struct Row {
        archived_at: Option<String>,
        archived_by: Option<String>,
    }
    let row: Option<Row> = db
        .prepare("SELECT archived_at, archived_by FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.and_then(|row| row.archived_at.zip(row.archived_by)))
}

pub async fn project_is_archived(db: &D1Database, tenant: &str, project: &str) -> Result<bool> {
    Ok(project_archive(db, tenant, project).await?.is_some())
}

pub async fn update_project_settings(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
    visibility: &str,
    default_workspace: &str,
    navbar_items: Option<Vec<NavbarItem>>,
    panels: Option<Vec<PanelItem>>,
    archived: Option<bool>,
    public_releases: Option<bool>,
) -> Result<ProjectSettings> {
    let mut settings = project_settings(db, tenant, project, Some(principal)).await?;
    settings.visibility = visibility.to_string();
    settings.default_workspace = default_workspace.to_string();
    if let Some(public) = public_releases {
        settings.public_releases = public;
    }
    if let Some(items) = navbar_items {
        settings.navbar_items = items;
    }
    if let Some(p) = panels {
        settings.panels = p;
    }
    let json = serde_json::to_string(&settings).map_err(|e| err(e.to_string()))?;
    db.prepare("UPDATE projects SET settings_json = ?1 WHERE tenant = ?2 AND project = ?3")
        .bind(&[js_str(&json), js_str(tenant), js_str(project)])?
        .run()
        .await?;
    if let Some(archive) = archived {
        set_project_archived(db, tenant, project, principal, archive).await?;
    }
    project_settings(db, tenant, project, Some(principal)).await
}

async fn set_project_archived(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
    archived: bool,
) -> Result<()> {
    if archived {
        db.prepare(
            "UPDATE projects
             SET archived_at = COALESCE(archived_at, ?1),
                 archived_by = COALESCE(archived_by, ?2)
             WHERE tenant = ?3 AND project = ?4",
        )
        .bind(&[
            js_str(&now_rfc3339()),
            js_str(&principal.user),
            js_str(tenant),
            js_str(project),
        ])?
        .run()
        .await?;
    } else {
        db.prepare(
            "UPDATE projects
             SET archived_at = NULL,
                 archived_by = NULL
             WHERE tenant = ?1 AND project = ?2",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .run()
        .await?;
    }
    Ok(())
}
