use super::*;

#[derive(Clone)]
pub struct LeafInput {
    pub slug: String,
    pub title: String,
    pub body: String,
    pub visibility: String,
    pub attached_type: String,
    pub attached_id: Option<String>,
    pub tags: Vec<String>,
    pub pinned: bool,
}

pub struct LeafPatch {
    pub slug: Option<String>,
    pub title: Option<String>,
    pub body: Option<String>,
    pub visibility: Option<String>,
    pub attached_type: Option<String>,
    pub attached_id: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub pinned: Option<bool>,
}

#[derive(Deserialize)]
struct LeafRow {
    id: String,
    tenant: String,
    project: String,
    slug: String,
    title: String,
    body: String,
    visibility: String,
    attached_type: String,
    attached_id: Option<String>,
    tags_json: String,
    pinned: f64,
    author: String,
    created_at: String,
    updated_at: String,
    display_name: Option<String>,
    handle: Option<String>,
    account_tenant: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    profile_updated_at: Option<String>,
}

pub async fn list_leaves(db: &Database, tenant: &str, project: Option<&str>) -> Result<Vec<Leaf>> {
    let project_key = project.unwrap_or_default();
    let result = db
        .prepare(
            "SELECT l.id, l.tenant, l.project, l.slug, l.title, l.body, l.visibility, l.attached_type,
                    l.attached_id, l.tags_json, l.pinned, l.author, l.created_at, l.updated_at,
                    u.display_name, u.handle,
                    (SELECT t.name FROM tenants t WHERE t.owner = l.author AND t.kind = 'user' ORDER BY t.name LIMIT 1) AS account_tenant,
                    u.avatar_url, u.email, u.updated_at AS profile_updated_at
             FROM leaves l
             LEFT JOIN user_profiles u ON u.user = l.author
             WHERE l.tenant = ?1 AND l.project = ?2
             ORDER BY l.pinned DESC, l.updated_at DESC, l.created_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project_key)])?
        .all()
        .await?;
    let rows: Vec<LeafRow> = result.results()?;
    Ok(rows.into_iter().map(leaf_from_row).collect())
}

pub async fn leaf_by_id_or_slug(
    db: &Database,
    tenant: &str,
    project: Option<&str>,
    id_or_slug: &str,
) -> Result<Option<Leaf>> {
    Ok(list_leaves(db, tenant, project)
        .await?
        .into_iter()
        .find(|leaf| leaf.id == id_or_slug || leaf.slug == id_or_slug))
}

pub async fn leaf_slug_exists(
    db: &Database,
    tenant: &str,
    project: Option<&str>,
    slug: &str,
    except_id: Option<&str>,
) -> Result<bool> {
    #[derive(Deserialize)]
    struct Row {
        count: f64,
    }
    let project_key = project.unwrap_or_default();
    let row: Option<Row> = db
        .prepare(
            "SELECT COUNT(*) AS count
             FROM leaves
             WHERE tenant = ?1 AND project = ?2 AND slug = ?3 AND (?4 IS NULL OR id != ?4)",
        )
        .bind(&[
            js_str(tenant),
            js_str(project_key),
            js_str(slug),
            js_opt(except_id),
        ])?
        .first(None)
        .await?;
    Ok(row.is_some_and(|row| row.count > 0.0))
}

pub async fn create_leaf(
    db: &Database,
    tenant: &str,
    project: Option<&str>,
    principal: &TokenPrincipal,
    input: LeafInput,
) -> Result<Leaf> {
    let id = format!("leaf-{}", Uuid::new_v4().simple());
    let now = now_rfc3339();
    let project_key = project.unwrap_or_default();
    let tags_json = serde_json::to_string(&input.tags).map_err(|error| err(error.to_string()))?;
    db.prepare(
        "INSERT INTO leaves (
            id, tenant, project, slug, title, body, visibility, attached_type, attached_id,
            tags_json, pinned, author, created_at, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)",
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project_key),
        js_str(&input.slug),
        js_str(&input.title),
        js_str(&input.body),
        js_str(&input.visibility),
        js_str(&input.attached_type),
        js_opt(input.attached_id.as_deref()),
        js_str(&tags_json),
        wasm_bindgen::JsValue::from_f64(if input.pinned { 1.0 } else { 0.0 }),
        js_str(&principal.user),
        js_str(&now),
    ])?
    .run()
    .await?;
    if let Some(project) = project {
        recompute_project_stats(db, tenant, project).await?;
    }
    leaf_by_id_or_slug(db, tenant, project, &id)
        .await?
        .ok_or_else(|| err("leaf not found"))
}

pub async fn update_leaf(
    db: &Database,
    tenant: &str,
    project: Option<&str>,
    id_or_slug: &str,
    patch: LeafPatch,
) -> Result<Leaf> {
    let leaf = leaf_by_id_or_slug(db, tenant, project, id_or_slug)
        .await?
        .ok_or_else(|| err("leaf not found"))?;
    let tags_json = patch
        .tags
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| err(error.to_string()))?;
    let updated_at = now_rfc3339();
    db.prepare(
        "UPDATE leaves
         SET slug = COALESCE(?1, slug),
             title = COALESCE(?2, title),
             body = COALESCE(?3, body),
             visibility = COALESCE(?4, visibility),
             attached_type = COALESCE(?5, attached_type),
             attached_id = CASE WHEN ?6 = 1 THEN ?7 ELSE attached_id END,
             tags_json = COALESCE(?8, tags_json),
             pinned = COALESCE(?9, pinned),
             updated_at = ?10
         WHERE tenant = ?11 AND project = ?12 AND id = ?13",
    )
    .bind(&[
        js_opt(patch.slug.as_deref()),
        js_opt(patch.title.as_deref()),
        js_opt(patch.body.as_deref()),
        js_opt(patch.visibility.as_deref()),
        js_opt(patch.attached_type.as_deref()),
        wasm_bindgen::JsValue::from_f64(if patch.attached_id.is_some() {
            1.0
        } else {
            0.0
        }),
        js_opt(
            patch
                .attached_id
                .as_ref()
                .and_then(|value| value.as_deref()),
        ),
        js_opt(tags_json.as_deref()),
        patch
            .pinned
            .map(|value| wasm_bindgen::JsValue::from_f64(if value { 1.0 } else { 0.0 }))
            .unwrap_or(wasm_bindgen::JsValue::NULL),
        js_str(&updated_at),
        js_str(tenant),
        js_str(project.unwrap_or_default()),
        js_str(&leaf.id),
    ])?
    .run()
    .await?;
    if let Some(project) = project {
        recompute_project_stats(db, tenant, project).await?;
    }
    leaf_by_id_or_slug(db, tenant, project, &leaf.id)
        .await?
        .ok_or_else(|| err("leaf not found"))
}

pub async fn delete_leaf(
    db: &Database,
    tenant: &str,
    project: Option<&str>,
    id_or_slug: &str,
) -> Result<bool> {
    let Some(leaf) = leaf_by_id_or_slug(db, tenant, project, id_or_slug).await? else {
        return Ok(false);
    };
    db.prepare("DELETE FROM leaves WHERE tenant = ?1 AND project = ?2 AND id = ?3")
        .bind(&[
            js_str(tenant),
            js_str(project.unwrap_or_default()),
            js_str(&leaf.id),
        ])?
        .run()
        .await?;
    if let Some(project) = project {
        recompute_project_stats(db, tenant, project).await?;
    }
    Ok(true)
}

fn leaf_from_row(row: LeafRow) -> Leaf {
    let project = row.project.as_str();
    let project_option = (!project.is_empty()).then(|| project.to_string());
    let slug = row.slug;
    let tenant = row.tenant;
    let href = match project_option.as_deref() {
        Some(project) => format!("/{tenant}/{project}/leaves/{slug}"),
        None => format!("/{tenant}/leaves/{slug}"),
    };
    Leaf {
        id: row.id,
        tenant,
        project: project_option,
        slug: slug.clone(),
        title: row.title,
        body: row.body,
        visibility: row.visibility,
        attached_type: row.attached_type,
        attached_id: row.attached_id,
        tags: serde_json::from_str(&row.tags_json).unwrap_or_default(),
        pinned: row.pinned != 0.0,
        author_profile: user_profile_from_parts(
            &row.author,
            row.display_name,
            row.handle,
            row.account_tenant,
            row.avatar_url,
            row.email,
            row.profile_updated_at,
        ),
        author: row.author,
        created_at: row.created_at,
        updated_at: row.updated_at,
        href,
    }
}
