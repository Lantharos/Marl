use super::*;
pub async fn ensure_project(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    ensure_account_tenant(db, &principal.user).await?;
    if !tenant_exists(db, tenant).await? {
        return Err(err(format!(
            "tenant `{tenant}` does not exist; create it first with `sty tenant new {tenant}`"
        )));
    }
    if !tenant_control(db, tenant, &principal.user).await? {
        return Err(err("tenant control denied"));
    }

    #[derive(Deserialize)]
    struct OwnerRow {
        owner: String,
    }
    let existing: Option<OwnerRow> = db
        .prepare("SELECT owner FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;

    if let Some(existing) = existing {
        if existing.owner != principal.user && !tenant_control(db, tenant, &principal.user).await? {
            return Err(err("tenant control denied"));
        }
        return Ok(());
    }

    let settings = serde_json::to_string(&ProjectSettings {
        visibility: "private".to_string(),
        follower_count: 0,
        is_following: false,
        default_workspace: "main".to_string(),
        navbar_items: vec![],
        panels: vec![],
    })
    .map_err(|e| err(e.to_string()))?;
    db.prepare(
        "INSERT INTO projects (tenant, project, owner, settings_json) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(&principal.user),
        js_str(&settings),
    ])?
    .run()
    .await?;
    recompute_project_stats(db, tenant, project).await?;

    Ok(())
}

pub async fn get_project(
    db: &D1Database,
    tenant: &str,
    project: &str,
) -> Result<Option<ProjectSummary>> {
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT tenant, project FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|r| ProjectSummary {
        owner: r.tenant.clone(),
        tenant: r.tenant,
        project: r.project,
    }))
}

pub async fn projects(db: &D1Database, principal: &TokenPrincipal) -> Result<Vec<ProjectSummary>> {
    ensure_collaboration_schema(db).await?;
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
    }
    let result = db
        .prepare(
            "SELECT p.tenant, p.project FROM projects p \
             JOIN tenants t ON t.name = p.tenant \
             WHERE (t.owner = ?1 \
                OR p.owner = ?1 \
                OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?1) \
                OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?1)) \
             ORDER BY p.tenant, p.project",
        )
        .bind(&[js_str(&principal.user)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| ProjectSummary {
            owner: r.tenant.clone(),
            tenant: r.tenant,
            project: r.project,
        })
        .collect())
}

pub async fn project_access(
    db: &D1Database,
    tenant: &str,
    project: &str,
    user: &str,
) -> Result<bool> {
    #[derive(Deserialize)]
    struct Row {
        count: i64,
    }
    let row: Option<Row> = db
        .prepare("SELECT COUNT(*) AS count FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    if !row.is_some_and(|row| row.count > 0) {
        return Ok(false);
    }
    Ok(project_effective_role(db, tenant, project, user).await?.is_some())
}

pub async fn project_exists(db: &D1Database, tenant: &str, project: &str) -> Result<bool> {
    #[derive(Deserialize)]
    struct Row {
        count: i64,
    }
    let row: Option<Row> = db
        .prepare("SELECT COUNT(*) AS count FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.is_some_and(|row| row.count > 0))
}

pub async fn tenants(db: &D1Database, principal: &TokenPrincipal) -> Result<Vec<TenantSummary>> {
    ensure_collaboration_schema(db).await?;
    let account_tenant = ensure_account_tenant(db, &principal.user).await?;
    #[derive(Deserialize)]
    struct Row {
        name: String,
        kind: String,
        owner: String,
    }
    let result = db
        .prepare(
            "SELECT name, kind, owner FROM tenants \
             WHERE (owner = ?1 OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = tenants.name AND tm.user = ?1)) \
             AND (kind != 'user' OR name = ?2) \
             ORDER BY CASE WHEN name = ?2 THEN 0 ELSE 1 END, name",
        )
        .bind(&[
            js_str(&principal.user),
            js_str(&account_tenant),
        ])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| TenantSummary {
            name: r.name,
            kind: r.kind,
            owner: r.owner,
        })
        .collect())
}

pub async fn create_org(
    db: &D1Database,
    name: &str,
    principal: &TokenPrincipal,
) -> Result<TenantSummary> {
    ensure_account_tenant(db, &principal.user).await?;
    if tenant_exists(db, name).await? {
        return Err(err("tenant conflict"));
    }
    let members =
        serde_json::to_string(&vec![principal.user.clone()]).map_err(|e| err(e.to_string()))?;
    db.prepare("INSERT INTO tenants (name, kind, owner, members_json) VALUES (?1, 'org', ?2, ?3)")
        .bind(&[js_str(name), js_str(&principal.user), js_str(&members)])?
        .run()
        .await?;
    Ok(TenantSummary {
        name: name.to_string(),
        kind: "org".to_string(),
        owner: principal.user.clone(),
    })
}

pub async fn tenant_control(db: &D1Database, tenant: &str, user: &str) -> Result<bool> {
    Ok(role_allows(
        tenant_effective_role(db, tenant, user).await?.as_deref(),
        "maintainer",
    ))
}

pub async fn tenant_access(db: &D1Database, tenant: &str, user: &str) -> Result<bool> {
    Ok(role_allows(
        tenant_effective_role(db, tenant, user).await?.as_deref(),
        "viewer",
    ))
}

pub async fn ensure_account_tenant(db: &D1Database, user: &str) -> Result<String> {
    let tenant = account_tenant_name(db, user).await?;
    let members = serde_json::to_string(&vec![user.to_string()]).map_err(|e| err(e.to_string()))?;
    db.prepare(
        "INSERT OR IGNORE INTO tenants (name, kind, owner, members_json) VALUES (?1, 'user', ?2, ?3)",
    )
    .bind(&[js_str(&tenant), js_str(user), js_str(&members)])?
    .run()
    .await?;
    if tenant != user {
        db.prepare(
            "DELETE FROM tenants \
             WHERE name = ?1 AND kind = 'user' \
             AND NOT EXISTS (SELECT 1 FROM projects WHERE tenant = ?1)",
        )
        .bind(&[js_str(user)])?
        .run()
        .await?;
    }
    Ok(tenant)
}

pub(crate) async fn account_tenant_name(db: &D1Database, user: &str) -> Result<String> {
    #[derive(Deserialize)]
    struct Row {
        handle: Option<String>,
    }
    let row: Option<Row> = db
        .prepare("SELECT handle FROM user_profiles WHERE user = ?1")
        .bind(&[js_str(user)])?
        .first(None)
        .await?;
    let Some(handle) = row
        .and_then(|row| row.handle)
        .map(|handle| handle.trim().to_string())
        .filter(|handle| !handle.is_empty())
    else {
        return Err(err("account handle missing"));
    };
    validate_segment(&handle).map_err(|error| err(error.to_string()))?;
    Ok(handle)
}

pub async fn tenant_exists(db: &D1Database, tenant: &str) -> Result<bool> {
    #[derive(Deserialize)]
    struct Row {
        count: i64,
    }
    let row: Option<Row> = db
        .prepare("SELECT COUNT(*) AS count FROM tenants WHERE name = ?1")
        .bind(&[js_str(tenant)])?
        .first(None)
        .await?;
    Ok(row.is_some_and(|row| row.count > 0))
}

// -- Workspace heads --------------------------------------
