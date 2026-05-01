use super::*;

pub async fn follow_project(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<bool> {
    db.prepare(
        "INSERT OR IGNORE INTO project_follows (tenant, project, user, created_at) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(&principal.user),
        js_str(&now_rfc3339()),
    ])?
    .run()
    .await?;
    Ok(true)
}

pub async fn unfollow_project(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<bool> {
    db.prepare("DELETE FROM project_follows WHERE tenant = ?1 AND project = ?2 AND user = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user)])?
        .run()
        .await?;
    Ok(false)
}

pub async fn is_following(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: Option<&TokenPrincipal>,
) -> Result<bool> {
    let Some(principal) = principal else {
        return Ok(false);
    };
    #[derive(Deserialize)]
    struct CountRow {
        count: f64,
    }
    let row: Option<CountRow> = db
        .prepare(
            "SELECT COUNT(*) AS count FROM project_follows WHERE tenant = ?1 AND project = ?2 AND user = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user)])?
        .first(None)
        .await?;
    Ok(row.map(|r| r.count as u64).unwrap_or(0) > 0)
}

pub async fn follower_count(db: &Database, tenant: &str, project: &str) -> Result<u64> {
    #[derive(Deserialize)]
    struct CountRow {
        count: f64,
    }
    let row: Option<CountRow> = db
        .prepare("SELECT COUNT(*) AS count FROM project_follows WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|r| r.count as u64).unwrap_or(0))
}
