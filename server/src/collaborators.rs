use sty_protocol::{CollaboratorRequest, CollaboratorUpdateRequest, OkResponse};
use worker::*;

use crate::support::{db, json_error, paginate_vec, param, project_params};
use crate::{d1, optional_auth, require_auth};

pub(crate) async fn project_access(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    if !d1::tenant_exists(&database, &tenant).await? {
        return json_error(404, "tenant not found");
    }
    if !d1::project_exists(&database, &tenant, &project).await? {
        return json_error(404, "project not found");
    }
    let public_visible = matches!(
        d1::project_visibility(&database, &tenant, &project).await?,
        Some(visibility) if visibility == "public"
    );
    let access =
        d1::project_access_response(&database, &tenant, &project, user.as_deref(), public_visible)
            .await?;
    if !access.can_read {
        return json_error(403, "project access denied");
    }
    Response::from_json(&access)
}

pub(crate) async fn search_users(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = require_auth(&req, &ctx.env).await?;
    let url = req.url()?;
    let query = url
        .query_pairs()
        .find_map(|(key, value)| (key == "q").then(|| value.to_string()))
        .unwrap_or_default();
    let database = db(&ctx.env)?;
    let users = d1::search_users(&database, &query, 10).await?;
    Response::from_json(&paginate_vec(url, users))
}

pub(crate) async fn list_tenant_collaborators(
    req: Request,
    ctx: RouteContext<()>,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let tenant = tenant_param(&ctx)?;
    let database = db(&ctx.env)?;
    if !d1::tenant_exists(&database, &tenant).await? {
        return json_error(404, "tenant not found");
    }
    if !d1::tenant_access(&database, &tenant, &user).await? {
        return json_error(403, "tenant access denied");
    }
    let collaborators = d1::list_tenant_collaborators(&database, &tenant).await?;
    Response::from_json(&paginate_vec(req.url()?, collaborators))
}

pub(crate) async fn add_tenant_collaborator(
    mut req: Request,
    ctx: RouteContext<()>,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let tenant = tenant_param(&ctx)?;
    let body: CollaboratorRequest = req.json().await?;
    let database = db(&ctx.env)?;
    require_tenant_owner(&database, &tenant, &user).await?;
    let item =
        d1::upsert_tenant_collaborator(&database, &tenant, &body.user, &body.role, &user).await?;
    Response::from_json(&item)
}

pub(crate) async fn update_tenant_collaborator(
    mut req: Request,
    ctx: RouteContext<()>,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let tenant = tenant_param(&ctx)?;
    let target = param(&ctx, "user")?;
    let body: CollaboratorUpdateRequest = req.json().await?;
    let database = db(&ctx.env)?;
    require_tenant_owner(&database, &tenant, &user).await?;
    let item =
        d1::upsert_tenant_collaborator(&database, &tenant, &target, &body.role, &user).await?;
    Response::from_json(&item)
}

pub(crate) async fn delete_tenant_collaborator(
    req: Request,
    ctx: RouteContext<()>,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let tenant = tenant_param(&ctx)?;
    let target = param(&ctx, "user")?;
    let database = db(&ctx.env)?;
    require_tenant_owner(&database, &tenant, &user).await?;
    d1::delete_tenant_collaborator(&database, &tenant, &target).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn list_project_collaborators(
    req: Request,
    ctx: RouteContext<()>,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    require_project_maintainer(&database, &tenant, &project, &user).await?;
    let collaborators = d1::list_project_collaborators(&database, &tenant, &project).await?;
    Response::from_json(&paginate_vec(req.url()?, collaborators))
}

pub(crate) async fn add_project_collaborator(
    mut req: Request,
    ctx: RouteContext<()>,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: CollaboratorRequest = req.json().await?;
    let database = db(&ctx.env)?;
    require_project_maintainer(&database, &tenant, &project, &user).await?;
    let item = d1::upsert_project_collaborator(
        &database,
        &tenant,
        &project,
        &body.user,
        &body.role,
        &user,
    )
    .await?;
    Response::from_json(&item)
}

pub(crate) async fn update_project_collaborator(
    mut req: Request,
    ctx: RouteContext<()>,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let target = param(&ctx, "user")?;
    let body: CollaboratorUpdateRequest = req.json().await?;
    let database = db(&ctx.env)?;
    require_project_maintainer(&database, &tenant, &project, &user).await?;
    let item = d1::upsert_project_collaborator(
        &database,
        &tenant,
        &project,
        &target,
        &body.role,
        &user,
    )
    .await?;
    Response::from_json(&item)
}

pub(crate) async fn delete_project_collaborator(
    req: Request,
    ctx: RouteContext<()>,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let target = param(&ctx, "user")?;
    let database = db(&ctx.env)?;
    require_project_maintainer(&database, &tenant, &project, &user).await?;
    d1::delete_project_collaborator(&database, &tenant, &project, &target).await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn require_tenant_owner(db: &D1Database, tenant: &str, user: &str) -> Result<()> {
    if !d1::tenant_exists(db, tenant).await? {
        return Err(Error::RustError("tenant not found".to_string()));
    }
    if d1::role_allows(
        d1::tenant_effective_role(db, tenant, user).await?.as_deref(),
        "owner",
    ) {
        return Ok(());
    }
    Err(Error::RustError("tenant owner access denied".to_string()))
}

async fn require_project_maintainer(
    db: &D1Database,
    tenant: &str,
    project: &str,
    user: &str,
) -> Result<()> {
    if !d1::tenant_exists(db, tenant).await? {
        return Err(Error::RustError("tenant not found".to_string()));
    }
    if !d1::project_exists(db, tenant, project).await? {
        return Err(Error::RustError("project not found".to_string()));
    }
    if d1::project_role_allows(db, tenant, project, user, "maintainer").await? {
        return Ok(());
    }
    Err(Error::RustError("project maintainer access denied".to_string()))
}

fn tenant_param(ctx: &RouteContext<()>) -> Result<String> {
    let tenant = param(ctx, "tenant")?;
    sty_protocol::validate_segment(&tenant).map_err(|error| Error::RustError(error.to_string()))?;
    Ok(tenant)
}
