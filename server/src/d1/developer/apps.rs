use super::*;

pub async fn create_developer_app(
    db: &D1Database,
    owner: &str,
    name: &str,
    redirect_uri: &str,
    description: Option<&str>,
    homepage_url: Option<&str>,
) -> Result<DeveloperApp> {
    ensure_developer_schema(db).await?;
    let id = format!("app_{}", Uuid::new_v4().simple());
    let client_id = format!("sty_app_{}", Uuid::new_v4().simple());
    let client_secret = new_token("sty_secret");
    let now = now_rfc3339();
    db.prepare(
        "INSERT INTO developer_apps
         (id, owner, name, description, homepage_url, redirect_uri, client_id, client_secret_hash, created_at, updated_at, revoked_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, NULL)",
    )
    .bind(&[
        js_str(&id),
        js_str(owner),
        js_str(name.trim()),
        js_opt(description),
        js_opt(homepage_url),
        js_str(redirect_uri.trim()),
        js_str(&client_id),
        js_str(&token_hash(&client_secret)),
        js_str(&now),
    ])?
    .run()
    .await?;
    Ok(DeveloperApp {
        id,
        owner: owner.to_string(),
        name: name.trim().to_string(),
        description: description.map(ToOwned::to_owned),
        homepage_url: homepage_url.map(ToOwned::to_owned),
        redirect_uri: redirect_uri.trim().to_string(),
        client_id,
        created_at: now.clone(),
        updated_at: now,
        revoked_at: None,
        client_secret: Some(client_secret),
    })
}

pub async fn list_developer_apps(db: &D1Database, owner: &str) -> Result<Vec<DeveloperApp>> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, owner, name, description, homepage_url, redirect_uri, client_id, created_at, updated_at, revoked_at
             FROM developer_apps
             WHERE owner = ?1 AND revoked_at IS NULL
             ORDER BY created_at DESC",
        )
        .bind(&[js_str(owner)])?
        .all()
        .await?;
    let rows: Vec<DeveloperAppRow> = result.results()?;
    Ok(rows.into_iter().map(app_from_row).collect())
}

pub async fn developer_app_by_client_id(
    db: &D1Database,
    client_id: &str,
) -> Result<Option<DeveloperApp>> {
    ensure_developer_schema(db).await?;
    let row: Option<DeveloperAppRow> = db
        .prepare(
            "SELECT id, owner, name, description, homepage_url, redirect_uri, client_id, created_at, updated_at, revoked_at
             FROM developer_apps
             WHERE client_id = ?1 AND revoked_at IS NULL",
        )
        .bind(&[js_str(client_id)])?
        .first(None)
        .await?;
    Ok(row.map(app_from_row))
}

pub async fn revoke_developer_app(db: &D1Database, owner: &str, id: &str) -> Result<bool> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "UPDATE developer_apps SET revoked_at = ?1, updated_at = ?1 WHERE owner = ?2 AND id = ?3 AND revoked_at IS NULL",
        )
        .bind(&[js_str(&now_rfc3339()), js_str(owner), js_str(id)])?
        .run()
        .await?;
    Ok(result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) > 0)
}

pub async fn create_oauth_code(
    db: &D1Database,
    client_id: &str,
    user: &str,
    tenant: &str,
    project: &str,
    scopes: &[String],
    redirect_uri: &str,
    state: Option<&str>,
) -> Result<String> {
    ensure_developer_schema(db).await?;
    let app = developer_app_by_client_id(db, client_id)
        .await?
        .ok_or_else(|| err("developer app not found"))?;
    if app.redirect_uri != redirect_uri {
        return Err(err("redirect uri mismatch"));
    }
    let code = new_token("sty_code");
    let scopes = normalize_scopes(scopes);
    let scopes_json = serde_json::to_string(&scopes).map_err(|e| err(e.to_string()))?;
    db.prepare(
        "INSERT INTO oauth_codes
         (code_hash, app_id, user, tenant, project, scopes_json, redirect_uri, state, created_at, expires_at, consumed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL)",
    )
    .bind(&[
        js_str(&token_hash(&code)),
        js_str(&app.id),
        js_str(user),
        js_str(tenant),
        js_str(project),
        js_str(&scopes_json),
        js_str(redirect_uri),
        js_opt(state),
        js_str(&now_rfc3339()),
        js_str(&minutes_from_now(10.0)),
    ])?
    .run()
    .await?;
    Ok(code)
}

pub async fn exchange_oauth_code(
    db: &D1Database,
    client_id: &str,
    client_secret: &str,
    code: &str,
    redirect_uri: &str,
) -> Result<Option<OAuthGrant>> {
    ensure_developer_schema(db).await?;
    let Some(app) = developer_app_for_secret(db, client_id, client_secret).await? else {
        return Ok(None);
    };
    #[derive(Deserialize)]
    struct CodeRow {
        user: String,
        tenant: String,
        project: String,
        scopes_json: String,
        redirect_uri: String,
        expires_at: String,
    }
    let code_hash = token_hash(code);
    let row: Option<CodeRow> = db
        .prepare(
            "SELECT user, tenant, project, scopes_json, redirect_uri, expires_at
             FROM oauth_codes
             WHERE code_hash = ?1 AND app_id = ?2",
        )
        .bind(&[js_str(&code_hash), js_str(&app.id)])?
        .first(None)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    if is_expired(&row.expires_at) || row.redirect_uri != redirect_uri {
        return Ok(None);
    }
    let now = now_rfc3339();
    let result = db
        .prepare(
            "UPDATE oauth_codes
             SET consumed_at = ?1
             WHERE code_hash = ?2
               AND app_id = ?3
               AND consumed_at IS NULL
               AND expires_at > ?1
               AND redirect_uri = ?4",
        )
        .bind(&[
            js_str(&now),
            js_str(&code_hash),
            js_str(&app.id),
            js_str(redirect_uri),
        ])?
        .run()
        .await?;
    if result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) != 1 {
        return Ok(None);
    }
    let scopes = json_vec(&row.scopes_json);
    let key = create_project_api_key(
        db,
        &row.tenant,
        &row.project,
        &row.user,
        &app.name,
        &scopes,
        None,
    )
    .await?;
    let integration = create_project_integration(
        db,
        &row.tenant,
        &row.project,
        &app.id,
        &app.name,
        &scopes,
        &row.user,
    )
    .await?;
    Ok(Some(OAuthGrant {
        access_token: key.token.unwrap_or_default(),
        expires_at: key.expires_at,
        scope: scopes.join(" "),
        tenant: row.tenant,
        project: row.project,
        integration_id: integration.id,
    }))
}

pub async fn list_project_integrations(
    db: &D1Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<ProjectIntegration>> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, tenant, project, app_id, app_name, scopes_json, installed_by, created_at, revoked_at
             FROM project_integrations
             WHERE tenant = ?1 AND project = ?2 AND revoked_at IS NULL
             ORDER BY created_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<ProjectIntegrationRow> = result.results()?;
    Ok(rows.into_iter().map(integration_from_row).collect())
}

pub async fn revoke_project_integration(
    db: &D1Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<bool> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "UPDATE project_integrations SET revoked_at = ?1 WHERE tenant = ?2 AND project = ?3 AND id = ?4 AND revoked_at IS NULL",
        )
        .bind(&[js_str(&now_rfc3339()), js_str(tenant), js_str(project), js_str(id)])?
        .run()
        .await?;
    Ok(result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) > 0)
}

async fn create_project_integration(
    db: &D1Database,
    tenant: &str,
    project: &str,
    app_id: &str,
    app_name: &str,
    scopes: &[String],
    installed_by: &str,
) -> Result<ProjectIntegration> {
    let id = format!("int_{}", Uuid::new_v4().simple());
    let created_at = now_rfc3339();
    let scopes_json = serde_json::to_string(scopes).map_err(|e| err(e.to_string()))?;
    db.prepare(
        "INSERT INTO project_integrations
         (id, tenant, project, app_id, app_name, scopes_json, installed_by, created_at, revoked_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL)",
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        js_str(app_id),
        js_str(app_name),
        js_str(&scopes_json),
        js_str(installed_by),
        js_str(&created_at),
    ])?
    .run()
    .await?;
    Ok(ProjectIntegration {
        id,
        tenant: tenant.to_string(),
        project: project.to_string(),
        app_id: app_id.to_string(),
        app_name: app_name.to_string(),
        scopes: scopes.to_vec(),
        installed_by: installed_by.to_string(),
        created_at,
        revoked_at: None,
    })
}

async fn developer_app_for_secret(
    db: &D1Database,
    client_id: &str,
    client_secret: &str,
) -> Result<Option<DeveloperApp>> {
    #[derive(Deserialize)]
    struct Row {
        id: String,
        owner: String,
        name: String,
        description: Option<String>,
        homepage_url: Option<String>,
        redirect_uri: String,
        client_id: String,
        client_secret_hash: String,
        created_at: String,
        updated_at: String,
        revoked_at: Option<String>,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT id, owner, name, description, homepage_url, redirect_uri, client_id, client_secret_hash, created_at, updated_at, revoked_at
             FROM developer_apps
             WHERE client_id = ?1 AND revoked_at IS NULL",
        )
        .bind(&[js_str(client_id)])?
        .first(None)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    if !constant_time_eq(
        row.client_secret_hash.as_bytes(),
        token_hash(client_secret).as_bytes(),
    ) {
        return Ok(None);
    }
    Ok(Some(DeveloperApp {
        id: row.id,
        owner: row.owner,
        name: row.name,
        description: row.description,
        homepage_url: row.homepage_url,
        redirect_uri: row.redirect_uri,
        client_id: row.client_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        revoked_at: row.revoked_at,
        client_secret: None,
    }))
}
