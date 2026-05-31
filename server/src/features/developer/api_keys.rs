use super::*;

pub async fn create_project_api_key(
    db: &Database,
    tenant: &str,
    project: &str,
    user: &str,
    name: &str,
    scopes: &[String],
    expires_at: Option<&str>,
) -> Result<ProjectApiKey> {
    ensure_developer_schema(db).await?;
    let scopes = normalize_scopes(scopes);
    let token = new_token("sty_pk");
    let id = format!("pak_{}", Uuid::new_v4().simple());
    let prefix = token.chars().take(18).collect::<String>();
    let created_at = now_rfc3339();
    let scopes_json = serde_json::to_string(&scopes).map_err(|e| err(e.to_string()))?;
    db.prepare(
        "INSERT INTO project_api_keys
         (id, token_hash, prefix, tenant, project, name, scopes_json, created_by, created_at, last_used_at, expires_at, revoked_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10, NULL)",
    )
    .bind(&[
        js_str(&id),
        js_str(&token_hash(&token)),
        js_str(&prefix),
        js_str(tenant),
        js_str(project),
        js_str(name.trim()),
        js_str(&scopes_json),
        js_str(user),
        js_str(&created_at),
        js_opt(expires_at),
    ])?
    .run()
    .await?;
    Ok(ProjectApiKey {
        id,
        prefix,
        tenant: tenant.to_string(),
        project: project.to_string(),
        name: name.trim().to_string(),
        scopes,
        created_by: user.to_string(),
        created_at,
        last_used_at: None,
        expires_at: expires_at.map(ToOwned::to_owned),
        revoked_at: None,
        token: Some(token),
    })
}

pub async fn list_project_api_keys(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<ProjectApiKey>> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, prefix, tenant, project, name, scopes_json, created_by, created_at, last_used_at, expires_at, revoked_at
             FROM project_api_keys
             WHERE tenant = ?1 AND project = ?2 AND revoked_at IS NULL
             ORDER BY created_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<ApiKeyRow> = result.results()?;
    Ok(rows.into_iter().map(api_key_from_row).collect())
}

pub async fn revoke_project_api_key(
    db: &Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<bool> {
    ensure_developer_schema(db).await?;
    let result = db
        .prepare(
            "UPDATE project_api_keys SET revoked_at = ?1 WHERE tenant = ?2 AND project = ?3 AND id = ?4 AND revoked_at IS NULL",
        )
        .bind(&[js_str(&now_rfc3339()), js_str(tenant), js_str(project), js_str(id)])?
        .run()
        .await?;
    Ok(result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) > 0)
}

pub async fn principal_for_api_key(db: &Database, token: &str) -> Result<Option<TokenPrincipal>> {
    ensure_developer_schema(db).await?;
    let hash = token_hash(token);
    let row: Option<ApiKeyRow> = db
        .prepare(
            "SELECT id, prefix, tenant, project, name, scopes_json, created_by, created_at, last_used_at, expires_at, revoked_at
             FROM project_api_keys
             WHERE token_hash = ?1",
        )
        .bind(&[js_str(&hash)])?
        .first(None)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    if row.revoked_at.is_some() || row.expires_at.as_deref().is_some_and(is_expired) {
        return Ok(None);
    }
    db.prepare("UPDATE project_api_keys SET last_used_at = ?1 WHERE id = ?2")
        .bind(&[js_str(&now_rfc3339()), js_str(&row.id)])?
        .run()
        .await?;
    Ok(Some(TokenPrincipal {
        user: format!("api-key:{}", row.id),
    }))
}

pub async fn project_api_key_role(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: &str,
) -> Result<Option<String>> {
    ensure_developer_schema(db).await?;
    let Some(id) = principal.strip_prefix("api-key:") else {
        return Ok(None);
    };
    let row: Option<ApiKeyRow> = db
        .prepare(
            "SELECT id, prefix, tenant, project, name, scopes_json, created_by, created_at, last_used_at, expires_at, revoked_at
             FROM project_api_keys
             WHERE id = ?1 AND tenant = ?2 AND project = ?3 AND revoked_at IS NULL",
        )
        .bind(&[js_str(id), js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row
        .filter(|row| {
            row.expires_at
                .as_deref()
                .map_or(true, |value| !is_expired(value))
        })
        .map(|row| role_for_scopes(&normalize_scopes(&json_vec(&row.scopes_json))).to_string()))
}

pub async fn project_api_key_allows(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: &str,
    required: &str,
) -> Result<Option<bool>> {
    ensure_developer_schema(db).await?;
    let Some(id) = principal.strip_prefix("api-key:") else {
        return Ok(None);
    };
    let row: Option<ApiKeyRow> = db
        .prepare(
            "SELECT id, prefix, tenant, project, name, scopes_json, created_by, created_at, last_used_at, expires_at, revoked_at
             FROM project_api_keys
             WHERE id = ?1 AND tenant = ?2 AND project = ?3 AND revoked_at IS NULL",
        )
        .bind(&[js_str(id), js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row
        .filter(|row| {
            row.expires_at
                .as_deref()
                .map_or(true, |value| !is_expired(value))
        })
        .map(|row| scope_allows(&normalize_scopes(&json_vec(&row.scopes_json)), required)))
}
