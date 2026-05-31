use sty_protocol::{CollaboratorRequest, CollaboratorUpdateRequest, OkResponse};
use worker::*;

use crate::features;
use crate::routes::objects::{optional_auth, require_auth};
use crate::support::{db, json_error, paginate_vec, param, project_params};

pub(crate) async fn project_access(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    if !features::tenant_exists(&database, &tenant).await? {
        return json_error(404, "tenant not found");
    }
    if !features::project_exists(&database, &tenant, &project).await? {
        return json_error(404, "project not found");
    }
    let public_visible = matches!(
        features::project_visibility(&database, &tenant, &project).await?,
        Some(visibility) if visibility == "public"
    );
    let access = features::project_access_response(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        public_visible,
    )
    .await?;
    if !access.can_read {
        return json_error(403, "project access denied");
    }
    Response::from_json(&access)
}

pub(crate) async fn search_users(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let _ = require_auth(&req, &ctx).await?;
    let url = req.url()?;
    let query = url
        .query_pairs()
        .find_map(|(key, value)| (key == "q").then(|| value.to_string()))
        .unwrap_or_default();
    let database = db(&ctx)?;
    let limit = url
        .query_pairs()
        .find_map(|(key, value)| {
            (key == "per_page" || key == "limit")
                .then(|| value.parse::<usize>().ok())
                .flatten()
        })
        .unwrap_or(10)
        .clamp(1, 50);
    let users = features::search_users(&database, &query, limit).await?;
    Response::from_json(&paginate_vec(url, users))
}

pub(crate) async fn list_tenant_collaborators(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let tenant = tenant_param(&ctx)?;
    let database = db(&ctx)?;
    if !features::tenant_exists(&database, &tenant).await? {
        return json_error(404, "tenant not found");
    }
    if !features::tenant_access(&database, &tenant, &user).await? {
        return json_error(403, "tenant access denied");
    }
    let collaborators = features::list_tenant_collaborators(&database, &tenant).await?;
    Response::from_json(&paginate_vec(req.url()?, collaborators))
}

pub(crate) async fn add_tenant_collaborator(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let tenant = tenant_param(&ctx)?;
    let body: CollaboratorRequest = req.json().await?;
    let database = db(&ctx)?;
    require_tenant_owner(&database, &tenant, &user).await?;
    let item =
        features::upsert_tenant_collaborator(&database, &tenant, &body.user, &body.role, &user)
            .await?;
    Response::from_json(&item)
}

pub(crate) async fn update_tenant_collaborator(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let tenant = tenant_param(&ctx)?;
    let target = param(&ctx, "user")?;
    let body: CollaboratorUpdateRequest = req.json().await?;
    let database = db(&ctx)?;
    require_tenant_owner(&database, &tenant, &user).await?;
    let item = features::upsert_tenant_collaborator(&database, &tenant, &target, &body.role, &user)
        .await?;
    Response::from_json(&item)
}

pub(crate) async fn delete_tenant_collaborator(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let tenant = tenant_param(&ctx)?;
    let target = param(&ctx, "user")?;
    let database = db(&ctx)?;
    require_tenant_owner(&database, &tenant, &user).await?;
    features::delete_tenant_collaborator(&database, &tenant, &target).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn list_project_collaborators(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    require_project_maintainer(&database, &tenant, &project, &user).await?;
    let collaborators = features::list_project_collaborators(&database, &tenant, &project).await?;
    Response::from_json(&paginate_vec(req.url()?, collaborators))
}

pub(crate) async fn add_project_collaborator(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: CollaboratorRequest = req.json().await?;
    let database = db(&ctx)?;
    require_project_maintainer(&database, &tenant, &project, &user).await?;
    let item = features::upsert_project_collaborator(
        &database, &tenant, &project, &body.user, &body.role, &user,
    )
    .await?;
    Response::from_json(&item)
}

pub(crate) async fn update_project_collaborator(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let target = param(&ctx, "user")?;
    let body: CollaboratorUpdateRequest = req.json().await?;
    let database = db(&ctx)?;
    require_project_maintainer(&database, &tenant, &project, &user).await?;
    let item = features::upsert_project_collaborator(
        &database, &tenant, &project, &target, &body.role, &user,
    )
    .await?;
    Response::from_json(&item)
}

pub(crate) async fn delete_project_collaborator(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let target = param(&ctx, "user")?;
    let database = db(&ctx)?;
    require_project_maintainer(&database, &tenant, &project, &user).await?;
    features::delete_project_collaborator(&database, &tenant, &project, &target).await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn require_tenant_owner(
    db: &crate::request_context::Database,
    tenant: &str,
    user: &str,
) -> Result<()> {
    if !features::tenant_exists(db, tenant).await? {
        return Err(Error::RustError("tenant not found".to_string()));
    }
    if features::role_allows(
        features::tenant_effective_role(db, tenant, user)
            .await?
            .as_deref(),
        "owner",
    ) {
        return Ok(());
    }
    Err(Error::RustError("tenant owner access denied".to_string()))
}

async fn require_project_maintainer(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: &str,
) -> Result<()> {
    if !features::tenant_exists(db, tenant).await? {
        return Err(Error::RustError("tenant not found".to_string()));
    }
    if !features::project_exists(db, tenant, project).await? {
        return Err(Error::RustError("project not found".to_string()));
    }
    if features::project_role_allows(db, tenant, project, user, "maintainer").await? {
        return Ok(());
    }
    Err(Error::RustError(
        "project maintainer access denied".to_string(),
    ))
}

fn tenant_param(ctx: &crate::request_context::AppRouteContext) -> Result<String> {
    let tenant = param(ctx, "tenant")?;
    sty_protocol::validate_segment(&tenant).map_err(|error| Error::RustError(error.to_string()))?;
    Ok(tenant)
}
