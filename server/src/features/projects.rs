use super::*;
pub async fn ensure_project(
    db: &Database,
    tenant: &str,
    project: &str,
    folder: Option<&str>,
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
        if let Some(folder) = folder {
            set_project_folder(db, tenant, project, Some(folder)).await?;
        }
        return Ok(());
    }

    let settings = serde_json::to_string(&ProjectSettings {
        visibility: "private".to_string(),
        follower_count: 0,
        is_following: false,
        public_releases: false,
        archived_at: None,
        archived_by: None,
        archived_by_profile: None,
        default_workspace: "main".to_string(),
        appearance: ProjectAppearance::default(),
        navbar_items: vec![],
        panels: vec![],
        merge_rules: MergeRules::default(),
        protected_workspaces: vec![],
        path_visibility: vec![],
        components: vec![],
        ci: ProjectCiSettings::default(),
    })
    .map_err(|e| err(e.to_string()))?;
    db.prepare(
        "INSERT INTO projects (tenant, project, owner, folder, settings_json) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(&principal.user),
        js_opt(folder),
        js_str(&settings),
    ])?
    .run()
    .await?;
    recompute_project_stats(db, tenant, project).await?;

    Ok(())
}

pub async fn get_project(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Option<ProjectSummary>> {
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
        folder: Option<String>,
    }
    let row: Option<Row> = db
        .prepare("SELECT tenant, project, folder FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|r| ProjectSummary {
        owner: r.tenant.clone(),
        tenant: r.tenant,
        project: r.project,
        folder: r.folder,
    }))
}

pub async fn projects(db: &Database, principal: &TokenPrincipal) -> Result<Vec<ProjectSummary>> {
    ensure_collaboration_schema(db).await?;
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
        folder: Option<String>,
    }
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.folder FROM projects p \
             JOIN tenants t ON t.name = p.tenant \
             WHERE (t.owner = ?1 \
                OR p.owner = ?1 \
                OR EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant = t.name AND tm.user = ?1) \
                OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.tenant = p.tenant AND pm.project = p.project AND pm.user = ?1)) \
             ORDER BY p.tenant, COALESCE(p.folder, ''), p.project",
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
            folder: r.folder,
        })
        .collect())
}

pub async fn project_access(
    db: &Database,
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
    Ok(project_effective_role(db, tenant, project, user)
        .await?
        .is_some())
}

pub async fn project_exists(db: &Database, tenant: &str, project: &str) -> Result<bool> {
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

pub async fn delete_project(db: &Database, tenant: &str, project: &str) -> Result<bool> {
    if !project_exists(db, tenant, project).await? {
        return Ok(false);
    }
    ensure_developer_schema(db).await?;
    ensure_review_schema(db).await?;
    ensure_governance_schema(db).await?;
    ensure_ci_schema(db).await?;
    for query in [
        "DELETE FROM comments WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM issues WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM protocol_items WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM protocol_reactions WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM workspace_reviews WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM workspace_checks WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM audit_log WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM notifications WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM leaves WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM history WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM workspace_heads WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM workspace_states WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM object_index WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM project_follows WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM project_members WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM project_stats WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM project_api_keys WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM project_webhooks WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM project_webhook_deliveries WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM project_integrations WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM ci_job_logs WHERE job_id IN (SELECT id FROM ci_jobs WHERE tenant = ?1 AND project = ?2)",
        "DELETE FROM ci_artifacts WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM ci_caches WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM ci_jobs WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM ci_runners WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM oauth_codes WHERE tenant = ?1 AND project = ?2",
        "DELETE FROM projects WHERE tenant = ?1 AND project = ?2",
    ] {
        db.prepare(query)
            .bind(&[js_str(tenant), js_str(project)])?
            .run()
            .await?;
    }
    Ok(true)
}

pub async fn set_project_folder(
    db: &Database,
    tenant: &str,
    project: &str,
    folder: Option<&str>,
) -> Result<()> {
    db.prepare("UPDATE projects SET folder = ?1 WHERE tenant = ?2 AND project = ?3")
        .bind(&[js_opt(folder), js_str(tenant), js_str(project)])?
        .run()
        .await?;
    Ok(())
}

pub async fn ensure_project_folder(
    db: &Database,
    tenant: &str,
    path: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    let mut current = String::new();
    for part in path.split('/') {
        if !current.is_empty() {
            current.push('/');
        }
        current.push_str(part);
        db.prepare(
            "INSERT OR IGNORE INTO project_folders (tenant, path, created_by, created_at)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(&[
            js_str(tenant),
            js_str(&current),
            js_str(&principal.user),
            js_str(&now_rfc3339()),
        ])?
        .run()
        .await?;
    }
    Ok(())
}

pub async fn tenant_folders(
    db: &Database,
    tenant: &str,
    public_only: bool,
) -> Result<Vec<sty_protocol::TenantFolder>> {
    #[derive(Deserialize)]
    struct Row {
        path: String,
    }
    let result = if public_only {
        db.prepare(
            "SELECT folder AS path FROM projects
             WHERE tenant = ?1
             AND folder IS NOT NULL
             AND folder != ''
             AND COALESCE(json_extract(settings_json, '$.visibility'), 'private') = 'public'
             ORDER BY path",
        )
        .bind(&[js_str(tenant)])?
        .all()
        .await?
    } else {
        db.prepare(
            "SELECT path FROM project_folders WHERE tenant = ?1
             UNION
             SELECT folder AS path FROM projects WHERE tenant = ?1 AND folder IS NOT NULL AND folder != ''
             ORDER BY path",
        )
        .bind(&[js_str(tenant)])?
        .all()
        .await?
    };
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let parent = row
                .path
                .rsplit_once('/')
                .map(|(parent, _)| parent.to_string());
            sty_protocol::TenantFolder {
                tenant: tenant.to_string(),
                path: row.path,
                parent,
            }
        })
        .collect())
}

pub async fn tenants(db: &Database, principal: &TokenPrincipal) -> Result<Vec<TenantSummary>> {
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
    db: &Database,
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

pub async fn create_account_tenant(
    db: &Database,
    name: &str,
    principal: &TokenPrincipal,
) -> Result<TenantSummary> {
    validate_segment(name).map_err(|error| err(error.to_string()))?;
    if user_account_tenant(db, &principal.user).await?.is_some() {
        return Err(err("account tenant already exists"));
    }
    if tenant_exists(db, name).await? {
        return Err(err("tenant conflict"));
    }
    let members =
        serde_json::to_string(&vec![principal.user.clone()]).map_err(|e| err(e.to_string()))?;
    db.prepare("INSERT INTO tenants (name, kind, owner, members_json) VALUES (?1, 'user', ?2, ?3)")
        .bind(&[js_str(name), js_str(&principal.user), js_str(&members)])?
        .run()
        .await?;
    Ok(TenantSummary {
        name: name.to_string(),
        kind: "user".to_string(),
        owner: principal.user.clone(),
    })
}

pub async fn tenant_control(db: &Database, tenant: &str, user: &str) -> Result<bool> {
    Ok(role_allows(
        tenant_effective_role(db, tenant, user).await?.as_deref(),
        "maintainer",
    ))
}

pub async fn tenant_access(db: &Database, tenant: &str, user: &str) -> Result<bool> {
    Ok(role_allows(
        tenant_effective_role(db, tenant, user).await?.as_deref(),
        "viewer",
    ))
}

pub async fn ensure_account_tenant(db: &Database, user: &str) -> Result<String> {
    if let Some(tenant) = user_account_tenant(db, user).await? {
        return Ok(tenant);
    }
    let tenant = account_tenant_name(db, user).await?;
    if tenant_exists(db, &tenant).await? {
        return Ok(tenant);
    }
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

pub async fn user_account_tenant(db: &Database, user: &str) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        name: String,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT name FROM tenants WHERE owner = ?1 AND kind = 'user' ORDER BY name LIMIT 1",
        )
        .bind(&[js_str(user)])?
        .first(None)
        .await?;
    Ok(row.map(|row| row.name))
}

pub async fn account_tenant_suggestions(db: &Database, user: &str) -> Result<Vec<String>> {
    let base = account_tenant_name(db, user).await?;
    let mut candidates = vec![
        format!("{base}-dev"),
        format!("{base}-code"),
        format!("{base}-sty"),
        format!("{base}-lab"),
        format!("{base}hq"),
    ];
    candidates.retain(|candidate| validate_segment(candidate).is_ok());
    let mut available = Vec::new();
    for candidate in candidates {
        if !tenant_exists(db, &candidate).await? {
            available.push(candidate);
        }
        if available.len() >= 3 {
            break;
        }
    }
    Ok(available)
}

pub(crate) async fn account_tenant_name(db: &Database, user: &str) -> Result<String> {
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

pub async fn tenant_exists(db: &Database, tenant: &str) -> Result<bool> {
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
