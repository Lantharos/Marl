use sty_protocol::{Leaf, LeafRequest, OkResponse, TokenPrincipal, validate_segment};
use worker::*;

#[path = "leaves/input.rs"]
mod input;

use input::{apply_leaf_query, leaf_input, leaf_patch};

use crate::features;
use crate::routes::objects::{
    check_project_read_capability, check_project_write_capability, optional_auth, require_auth,
};
use crate::support::{db, json_error, paginate_vec, param, project_params};

pub(crate) async fn list_project_leaves(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    ensure_project_target(&database, &tenant, &project).await?;
    let mut leaves = visible_project_leaves(&database, &tenant, &project, user.as_deref()).await?;
    apply_leaf_query(&req, &mut leaves)?;
    Response::from_json(&paginate_vec(req.url()?, leaves))
}

pub(crate) async fn create_project_leaf(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "contributor",
        "main:write",
    )
    .await?;
    let body: LeafRequest = req.json().await?;
    let input = leaf_input(&database, &tenant, Some(&project), body, None).await?;
    if input.pinned || input.visibility == "public" {
        check_project_write_capability(
            &database,
            &tenant,
            &project,
            &user,
            "maintainer",
            "settings:write",
        )
        .await?;
    }
    let leaf = features::create_leaf(
        &database,
        &tenant,
        Some(&project),
        &TokenPrincipal { user },
        input,
    )
    .await?;
    Response::from_json(&leaf)
}

pub(crate) async fn get_project_leaf(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let leaf_id = param(&ctx, "leaf")?;
    let database = db(&ctx)?;
    ensure_project_target(&database, &tenant, &project).await?;
    let Some(leaf) =
        features::leaf_by_id_or_slug(&database, &tenant, Some(&project), &leaf_id).await?
    else {
        return json_error(404, "leaf not found");
    };
    if !can_read_project_leaf(&database, &tenant, &project, user.as_deref(), &leaf).await? {
        return json_error(404, "leaf not found");
    }
    Response::from_json(&leaf)
}

pub(crate) async fn update_project_leaf(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let leaf_id = param(&ctx, "leaf")?;
    let database = db(&ctx)?;
    let Some(existing) =
        features::leaf_by_id_or_slug(&database, &tenant, Some(&project), &leaf_id).await?
    else {
        return json_error(404, "leaf not found");
    };
    ensure_project_leaf_write(&database, &tenant, &project, &user, &existing).await?;
    let body: LeafRequest = req.json().await?;
    if body.pinned.is_some() || body.visibility.as_deref() == Some("public") {
        check_project_write_capability(
            &database,
            &tenant,
            &project,
            &user,
            "maintainer",
            "settings:write",
        )
        .await?;
    }
    let patch = leaf_patch(&database, &tenant, Some(&project), body, &existing).await?;
    let leaf = features::update_leaf(&database, &tenant, Some(&project), &leaf_id, patch).await?;
    Response::from_json(&leaf)
}

pub(crate) async fn delete_project_leaf(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let leaf_id = param(&ctx, "leaf")?;
    let database = db(&ctx)?;
    let Some(existing) =
        features::leaf_by_id_or_slug(&database, &tenant, Some(&project), &leaf_id).await?
    else {
        return json_error(404, "leaf not found");
    };
    ensure_project_leaf_write(&database, &tenant, &project, &user, &existing).await?;
    features::delete_leaf(&database, &tenant, Some(&project), &leaf_id).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn list_tenant_leaves(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let tenant = tenant_param(&ctx)?;
    let database = db(&ctx)?;
    if !features::tenant_exists(&database, &tenant).await? {
        return json_error(404, "tenant not found");
    }
    let mut leaves = visible_tenant_leaves(&database, &tenant, user.as_deref()).await?;
    apply_leaf_query(&req, &mut leaves)?;
    Response::from_json(&paginate_vec(req.url()?, leaves))
}

pub(crate) async fn create_tenant_leaf(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let tenant = tenant_param(&ctx)?;
    let database = db(&ctx)?;
    ensure_tenant_write(&database, &tenant, &user, "contributor").await?;
    let body: LeafRequest = req.json().await?;
    let input = leaf_input(&database, &tenant, None, body, None).await?;
    if input.pinned || input.visibility == "public" {
        ensure_tenant_write(&database, &tenant, &user, "maintainer").await?;
    }
    let leaf =
        features::create_leaf(&database, &tenant, None, &TokenPrincipal { user }, input).await?;
    Response::from_json(&leaf)
}

pub(crate) async fn get_tenant_leaf(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let tenant = tenant_param(&ctx)?;
    let leaf_id = param(&ctx, "leaf")?;
    let database = db(&ctx)?;
    let Some(leaf) = features::leaf_by_id_or_slug(&database, &tenant, None, &leaf_id).await? else {
        return json_error(404, "leaf not found");
    };
    if !can_read_tenant_leaf(&database, &tenant, user.as_deref(), &leaf).await? {
        return json_error(404, "leaf not found");
    }
    Response::from_json(&leaf)
}

pub(crate) async fn update_tenant_leaf(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let tenant = tenant_param(&ctx)?;
    let leaf_id = param(&ctx, "leaf")?;
    let database = db(&ctx)?;
    let Some(existing) = features::leaf_by_id_or_slug(&database, &tenant, None, &leaf_id).await?
    else {
        return json_error(404, "leaf not found");
    };
    ensure_tenant_leaf_write(&database, &tenant, &user, &existing).await?;
    let body: LeafRequest = req.json().await?;
    if body.pinned.is_some() || body.visibility.as_deref() == Some("public") {
        ensure_tenant_write(&database, &tenant, &user, "maintainer").await?;
    }
    let patch = leaf_patch(&database, &tenant, None, body, &existing).await?;
    let leaf = features::update_leaf(&database, &tenant, None, &leaf_id, patch).await?;
    Response::from_json(&leaf)
}

pub(crate) async fn delete_tenant_leaf(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let tenant = tenant_param(&ctx)?;
    let leaf_id = param(&ctx, "leaf")?;
    let database = db(&ctx)?;
    let Some(existing) = features::leaf_by_id_or_slug(&database, &tenant, None, &leaf_id).await?
    else {
        return json_error(404, "leaf not found");
    };
    ensure_tenant_leaf_write(&database, &tenant, &user, &existing).await?;
    features::delete_leaf(&database, &tenant, None, &leaf_id).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn visible_project_leaves(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<Vec<Leaf>> {
    let mut visible = Vec::new();
    for leaf in features::list_leaves(database, tenant, Some(project)).await? {
        if can_read_project_leaf(database, tenant, project, user, &leaf).await? {
            visible.push(leaf);
        }
    }
    Ok(visible)
}

fn tenant_param(ctx: &crate::request_context::AppRouteContext) -> Result<String> {
    let tenant = param(ctx, "tenant")?;
    validate_segment(&tenant).map_err(|error| Error::RustError(error.to_string()))?;
    Ok(tenant)
}

async fn ensure_project_target(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
) -> Result<()> {
    if !features::tenant_exists(database, tenant).await?
        || !features::project_exists(database, tenant, project).await?
    {
        return Err(Error::RustError("project not found".to_string()));
    }
    Ok(())
}

async fn ensure_tenant_write(
    database: &crate::request_context::Database,
    tenant: &str,
    user: &str,
    minimum: &str,
) -> Result<()> {
    let role = features::tenant_effective_role(database, tenant, user).await?;
    if features::role_allows(role.as_deref(), minimum) {
        return Ok(());
    }
    Err(Error::RustError("tenant access denied".to_string()))
}

async fn ensure_project_leaf_write(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: &str,
    leaf: &Leaf,
) -> Result<()> {
    let role = features::project_effective_role(database, tenant, project, user).await?;
    if leaf.author == user || features::role_allows(role.as_deref(), "maintainer") {
        check_project_write_capability(
            database,
            tenant,
            project,
            user,
            "contributor",
            "main:write",
        )
        .await?;
        return Ok(());
    }
    Err(Error::RustError("project access denied".to_string()))
}

async fn ensure_tenant_leaf_write(
    database: &crate::request_context::Database,
    tenant: &str,
    user: &str,
    leaf: &Leaf,
) -> Result<()> {
    let role = features::tenant_effective_role(database, tenant, user).await?;
    if leaf.author == user || features::role_allows(role.as_deref(), "maintainer") {
        ensure_tenant_write(database, tenant, user, "contributor").await?;
        return Ok(());
    }
    Err(Error::RustError("tenant access denied".to_string()))
}

async fn can_read_project_leaf(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
    leaf: &Leaf,
) -> Result<bool> {
    if leaf.visibility == "public" {
        return Ok(true);
    }
    let Some(user) = user else {
        return Ok(false);
    };
    if check_project_read_capability(database, tenant, project, Some(user), "main:read")
        .await
        .is_err()
    {
        return Ok(false);
    }
    if leaf.visibility == "private" {
        let role = features::project_effective_role(database, tenant, project, user).await?;
        return Ok(leaf.author == user || features::role_allows(role.as_deref(), "maintainer"));
    }
    Ok(true)
}

async fn visible_tenant_leaves(
    database: &crate::request_context::Database,
    tenant: &str,
    user: Option<&str>,
) -> Result<Vec<Leaf>> {
    let mut visible = Vec::new();
    for leaf in features::list_leaves(database, tenant, None).await? {
        if can_read_tenant_leaf(database, tenant, user, &leaf).await? {
            visible.push(leaf);
        }
    }
    Ok(visible)
}

async fn can_read_tenant_leaf(
    database: &crate::request_context::Database,
    tenant: &str,
    user: Option<&str>,
    leaf: &Leaf,
) -> Result<bool> {
    if leaf.visibility == "public" {
        return Ok(true);
    }
    let Some(user) = user else {
        return Ok(false);
    };
    let role = features::tenant_effective_role(database, tenant, user).await?;
    if leaf.visibility == "private" {
        return Ok(leaf.author == user || features::role_allows(role.as_deref(), "maintainer"));
    }
    Ok(role.is_some())
}
