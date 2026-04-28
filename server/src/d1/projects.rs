use super::*;
pub async fn ensure_project(
    db: &D1Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
) -> Result<()> {
    let members = serde_json::to_string(&vec![principal.user.clone()]).map_err(|e| err(e.to_string()))?;

    db.prepare("INSERT OR IGNORE INTO tenants (name, kind, owner, members_json) VALUES (?1, 'user', ?2, ?3)")
        .bind(&[js_str(&principal.user), js_str(&principal.user), js_str(&members)])?
        .run()
        .await?;

    db.prepare("INSERT OR IGNORE INTO tenants (name, kind, owner, members_json) VALUES (?1, 'user', ?2, ?3)")
        .bind(&[js_str(tenant), js_str(&principal.user), js_str(&members)])?
        .run()
        .await?;

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
        if existing.owner != principal.user {
            let has_access = tenant_access(db, tenant, &principal.user).await?;
            if !has_access {
                return Err(err("project access denied"));
            }
        }
        return Ok(());
    }

    let settings = serde_json::to_string(&ProjectSettings {
        visibility: "private".to_string(),
        starred_count: 0,
        is_starred: false,
        default_workspace: "main".to_string(),
        navbar_items: vec![],
        panels: vec![],
    }).map_err(|e| err(e.to_string()))?;
    db.prepare("INSERT INTO projects (tenant, project, owner, settings_json) VALUES (?1, ?2, ?3, ?4)")
        .bind(&[js_str(tenant), js_str(project), js_str(&principal.user), js_str(&settings)])?
        .run()
        .await?;

    Ok(())
}

pub async fn get_project(db: &D1Database, tenant: &str, project: &str) -> Result<Option<ProjectSummary>> {
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
        owner: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT tenant, project, owner FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|r| ProjectSummary {
        tenant: r.tenant,
        project: r.project,
        owner: r.owner,
    }))
}

pub async fn projects(db: &D1Database, principal: &TokenPrincipal) -> Result<Vec<ProjectSummary>> {
    #[derive(Deserialize)]
    struct Row {
        tenant: String,
        project: String,
        owner: String,
    }
    let result = db
        .prepare(
            "SELECT p.tenant, p.project, p.owner FROM projects p \
             JOIN tenants t ON t.name = p.tenant \
             WHERE t.owner = ?1 OR t.members_json LIKE ?2 \
             ORDER BY p.tenant, p.project"
        )
        .bind(&[js_str(&principal.user), js_str(&format!("%\"{}\"%", principal.user))])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|r| ProjectSummary {
            tenant: r.tenant,
            project: r.project,
            owner: r.owner,
        })
        .collect())
}

pub async fn project_access(db: &D1Database, tenant: &str, project: &str, user: &str) -> Result<bool> {
    #[derive(Deserialize)]
    struct Row {
        owner: String,
        members_json: String,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT p.owner, t.members_json FROM projects p \
             JOIN tenants t ON t.name = p.tenant \
             WHERE p.tenant = ?1 AND p.project = ?2"
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(match row {
        Some(row) if row.owner == user => true,
        Some(row) => {
            let members: Vec<String> = serde_json::from_str(&row.members_json).unwrap_or_default();
            members.iter().any(|member| member == user)
        }
        None => false,
    })
}

pub async fn tenants(db: &D1Database, principal: &TokenPrincipal) -> Result<Vec<TenantSummary>> {
    #[derive(Deserialize)]
    struct Row {
        name: String,
        kind: String,
        owner: String,
    }
    let result = db
        .prepare("SELECT name, kind, owner FROM tenants WHERE owner = ?1 OR members_json LIKE ?2 ORDER BY name")
        .bind(&[js_str(&principal.user), js_str(&format!("%\"{}\"%", principal.user))])?
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

pub async fn create_org(db: &D1Database, name: &str, principal: &TokenPrincipal) -> Result<TenantSummary> {
    let members = serde_json::to_string(&vec![principal.user.clone()]).map_err(|e| err(e.to_string()))?;
    db.prepare("INSERT OR IGNORE INTO tenants (name, kind, owner, members_json) VALUES (?1, 'org', ?2, ?3)")
        .bind(&[js_str(name), js_str(&principal.user), js_str(&members)])?
        .run()
        .await?;
    Ok(TenantSummary {
        name: name.to_string(),
        kind: "org".to_string(),
        owner: principal.user.clone(),
    })
}

pub async fn tenant_access(db: &D1Database, tenant: &str, user: &str) -> Result<bool> {
    if tenant == user {
        let members = serde_json::to_string(&vec![user.to_string()]).map_err(|e| err(e.to_string()))?;
        db.prepare("INSERT OR IGNORE INTO tenants (name, kind, owner, members_json) VALUES (?1, 'user', ?2, ?3)")
            .bind(&[js_str(user), js_str(user), js_str(&members)])?
            .run()
            .await?;
        return Ok(true);
    }
    #[derive(Deserialize)]
    struct Row {
        members_json: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT members_json FROM tenants WHERE name = ?1")
        .bind(&[js_str(tenant)])?
        .first(None)
        .await?;
    Ok(match row {
        Some(r) => {
            let members: Vec<String> = serde_json::from_str(&r.members_json).unwrap_or_default();
            members.iter().any(|m| m == user)
        }
        None => false,
    })
}

// -- Workspace heads --------------------------------------

