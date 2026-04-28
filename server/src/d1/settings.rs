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
    principal: &TokenPrincipal,
) -> Result<ProjectSettings> {
    #[derive(Deserialize)]
    struct Row {
        settings_json: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT settings_json FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;

    let settings_json = match row {
        Some(r) => r.settings_json,
        None => {
            return Ok(ProjectSettings {
                visibility: "private".to_string(),
                starred_count: 0,
                is_starred: false,
                default_workspace: "main".to_string(),
                navbar_items: vec![],
                panels: vec![],
            });
        }
    };

    let mut settings: ProjectSettings =
        serde_json::from_str(&settings_json).map_err(|e| err(e.to_string()))?;

    #[derive(Deserialize)]
    struct CountRow {
        count: f64,
    }
    let count_row: Option<CountRow> = db
        .prepare("SELECT COUNT(*) AS count FROM stars WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    settings.starred_count = count_row.map(|r| r.count as u64).unwrap_or(0);
    settings.is_starred = is_starred(db, tenant, project, principal).await?;

    Ok(settings)
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
) -> Result<ProjectSettings> {
    let mut settings = project_settings(db, tenant, project, principal).await?;
    settings.visibility = visibility.to_string();
    settings.default_workspace = default_workspace.to_string();
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
    Ok(settings)
}

pub async fn star_project(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<(bool, u64)> {
    db.prepare("INSERT OR IGNORE INTO stars (tenant, project, user) VALUES (?1, ?2, ?3)")
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user)])?
        .run()
        .await?;
    let count = star_count(db, tenant, project).await?;
    Ok((true, count))
}

pub async fn unstar_project(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<(bool, u64)> {
    db.prepare("DELETE FROM stars WHERE tenant = ?1 AND project = ?2 AND user = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user)])?
        .run()
        .await?;
    let count = star_count(db, tenant, project).await?;
    Ok((false, count))
}

pub async fn is_starred(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<bool> {
    #[derive(Deserialize)]
    struct CountRow {
        count: f64,
    }
    let row: Option<CountRow> = db
        .prepare(
            "SELECT COUNT(*) AS count FROM stars WHERE tenant = ?1 AND project = ?2 AND user = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user)])?
        .first(None)
        .await?;
    Ok(row.map(|r| r.count as u64).unwrap_or(0) > 0)
}
