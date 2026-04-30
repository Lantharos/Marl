use super::*;
use std::collections::HashMap;
use sty_protocol::Collaborator;

pub async fn list_tenant_collaborators(db: &D1Database, tenant: &str) -> Result<Vec<Collaborator>> {
    ensure_collaboration_schema(db).await?;
    let owner = tenant_owner(db, tenant).await?;
    let mut collaborators = Vec::new();
    if let Some(owner) = owner {
        collaborators
            .push(collaborator(db, owner, ROLE_OWNER, "owner", None, None, None, false).await?);
    }

    #[derive(Deserialize)]
    struct Row {
        user: String,
        role: String,
        added_by: Option<String>,
        created_at: String,
        updated_at: String,
    }
    let result = db
        .prepare(
            "SELECT user, role, added_by, created_at, updated_at
             FROM tenant_members
             WHERE tenant = ?1
             ORDER BY CASE role WHEN 'maintainer' THEN 0 WHEN 'contributor' THEN 1 ELSE 2 END, user",
        )
        .bind(&[js_str(tenant)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    for row in rows {
        collaborators.push(
            collaborator(
                db,
                row.user,
                &row.role,
                "tenant",
                row.added_by,
                Some(row.created_at),
                Some(row.updated_at),
                true,
            )
            .await?,
        );
    }
    Ok(collaborators)
}

pub async fn upsert_tenant_collaborator(
    db: &D1Database,
    tenant: &str,
    user_input: &str,
    role: &str,
    added_by: &str,
) -> Result<Collaborator> {
    ensure_collaboration_schema(db).await?;
    let role = normalize_collaborator_role(role)?;
    let user = resolve_user(db, user_input).await?;
    if tenant_owner(db, tenant).await?.as_deref() == Some(user.as_str()) {
        return Err(err("tenant owner already has full access"));
    }
    let now = now_rfc3339();
    db.prepare(
        "INSERT INTO tenant_members (tenant, user, role, added_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(tenant, user) DO UPDATE SET
             role = excluded.role,
             added_by = excluded.added_by,
             updated_at = excluded.updated_at",
    )
    .bind(&[
        js_str(tenant),
        js_str(&user),
        js_str(&role),
        js_str(added_by),
        js_str(&now),
    ])?
    .run()
    .await?;
    rewrite_tenant_members_json(db, tenant).await?;
    collaborator(
        db,
        user,
        &role,
        "tenant",
        Some(added_by.to_string()),
        Some(now.clone()),
        Some(now),
        true,
    )
    .await
}

pub async fn delete_tenant_collaborator(
    db: &D1Database,
    tenant: &str,
    user_input: &str,
) -> Result<bool> {
    ensure_collaboration_schema(db).await?;
    let user = resolve_user(db, user_input).await?;
    let result = db
        .prepare("DELETE FROM tenant_members WHERE tenant = ?1 AND user = ?2")
        .bind(&[js_str(tenant), js_str(&user)])?
        .run()
        .await?;
    rewrite_tenant_members_json(db, tenant).await?;
    Ok(result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) > 0)
}

pub async fn list_project_collaborators(
    db: &D1Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<Collaborator>> {
    ensure_collaboration_schema(db).await?;
    let mut merged: HashMap<String, Collaborator> = HashMap::new();
    if let Some(owner) = project_owner(db, tenant, project).await? {
        let item = collaborator(db, owner, ROLE_OWNER, "owner", None, None, None, false).await?;
        merged.insert(item.user.clone(), item);
    }
    for item in list_tenant_collaborators(db, tenant).await? {
        insert_highest(&mut merged, item);
    }

    #[derive(Deserialize)]
    struct Row {
        user: String,
        role: String,
        added_by: Option<String>,
        created_at: String,
        updated_at: String,
    }
    let result = db
        .prepare(
            "SELECT user, role, added_by, created_at, updated_at
             FROM project_members
             WHERE tenant = ?1 AND project = ?2
             ORDER BY CASE role WHEN 'maintainer' THEN 0 WHEN 'contributor' THEN 1 ELSE 2 END, user",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .all()
        .await?;
    let rows: Vec<Row> = result.results()?;
    for row in rows {
        let item = collaborator(
            db,
            row.user,
            &row.role,
            "project",
            row.added_by,
            Some(row.created_at),
            Some(row.updated_at),
            true,
        )
        .await?;
        insert_highest(&mut merged, item);
    }
    let mut values = merged.into_values().collect::<Vec<_>>();
    values.sort_by(|a, b| {
        role_rank(&b.role)
            .cmp(&role_rank(&a.role))
            .then_with(|| a.user.cmp(&b.user))
    });
    Ok(values)
}

pub async fn upsert_project_collaborator(
    db: &D1Database,
    tenant: &str,
    project: &str,
    user_input: &str,
    role: &str,
    added_by: &str,
) -> Result<Collaborator> {
    ensure_collaboration_schema(db).await?;
    let role = normalize_collaborator_role(role)?;
    let user = resolve_user(db, user_input).await?;
    if project_owner(db, tenant, project).await?.as_deref() == Some(user.as_str()) {
        return Err(err("project owner already has full access"));
    }
    let now = now_rfc3339();
    db.prepare(
        "INSERT INTO project_members (tenant, project, user, role, added_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(tenant, project, user) DO UPDATE SET
             role = excluded.role,
             added_by = excluded.added_by,
             updated_at = excluded.updated_at",
    )
    .bind(&[
        js_str(tenant),
        js_str(project),
        js_str(&user),
        js_str(&role),
        js_str(added_by),
        js_str(&now),
    ])?
    .run()
    .await?;
    collaborator(
        db,
        user,
        &role,
        "project",
        Some(added_by.to_string()),
        Some(now.clone()),
        Some(now),
        true,
    )
    .await
}

pub async fn delete_project_collaborator(
    db: &D1Database,
    tenant: &str,
    project: &str,
    user_input: &str,
) -> Result<bool> {
    ensure_collaboration_schema(db).await?;
    let user = resolve_user(db, user_input).await?;
    let result = db
        .prepare("DELETE FROM project_members WHERE tenant = ?1 AND project = ?2 AND user = ?3")
        .bind(&[js_str(tenant), js_str(project), js_str(&user)])?
        .run()
        .await?;
    Ok(result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) > 0)
}
