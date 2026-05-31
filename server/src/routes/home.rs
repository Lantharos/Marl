use super::prelude::*;
use futures_util::future::{try_join, try_join5};

pub(crate) async fn home(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let principal = sty_protocol::TokenPrincipal { user };
    let (
        (projects, following, releases, discover, attention),
        (project_activity, followed_activity),
    ) = try_join(
        try_join5(
            features::dashboard_project_cards(&database, &principal, 15),
            features::followed_project_cards(&database, &principal, 25),
            features::followed_release_feed(&database, &principal, 25),
            features::popular_public_project_cards(&database, 40),
            features::home_attention(&database, &principal),
        ),
        try_join(
            features::project_activity(&database, &principal, 40),
            features::followed_activity(&database, &principal, 40),
        ),
    )
    .await?;
    Response::from_json(&sty_protocol::HomeResponse {
        projects,
        following,
        releases,
        discover,
        attention,
        activity: followed_activity.clone(),
        project_activity,
        followed_activity,
    })
}

pub(crate) async fn discover_projects(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let _ = optional_auth(&req, &ctx).await?;
    let url = req.url()?;
    let query = url
        .query_pairs()
        .find_map(|(key, value)| (key == "q").then(|| value.to_string()))
        .unwrap_or_default();
    let database = db(&ctx)?;
    let projects = features::public_project_cards(&database, &query, 200).await?;
    Response::from_json(&paginate_vec(url, projects))
}

pub(crate) async fn tenant_projects(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let tenant = param(&ctx, "tenant")?;
    validate_segment(&tenant).map_err(|error| Error::RustError(error.to_string()))?;
    let url = req.url()?;
    let query = url
        .query_pairs()
        .find_map(|(key, value)| (key == "q").then(|| value.to_string()))
        .unwrap_or_default();
    let database = db(&ctx)?;
    if !features::tenant_exists(&database, &tenant).await? {
        return json_error(404, "tenant not found");
    }
    let user = optional_auth(&req, &ctx).await?;
    let can_access = match user.as_deref() {
        Some(user) => features::tenant_access(&database, &tenant, user).await?,
        None => false,
    };
    let scope = if can_access { "all" } else { "public" };
    let projects = if can_access {
        features::tenant_project_cards(&database, &tenant, &query, user.as_deref(), 500).await?
    } else {
        features::tenant_public_project_cards(&database, &tenant, &query, 500).await?
    };
    let sty_protocol::Paginated {
        items,
        page,
        per_page,
        total,
        total_pages,
        next,
        prev,
    } = paginate_vec(url, projects);
    Response::from_json(&json!({
        "items": items,
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": total_pages,
        "next": next,
        "prev": prev,
        "scope": scope,
    }))
}

pub(crate) async fn user_profile(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let tenant = param(&ctx, "tenant")?;
    validate_segment(&tenant).map_err(|error| Error::RustError(error.to_string()))?;
    let user = optional_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let Some(profile) = features::user_profile_page(&database, &tenant, user.as_deref()).await?
    else {
        return json_error(404, "profile not found");
    };
    Response::from_json(&profile)
}

pub(crate) async fn update_user_profile_pins(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let tenant = param(&ctx, "tenant")?;
    validate_segment(&tenant).map_err(|error| Error::RustError(error.to_string()))?;
    let user = require_auth(&req, &ctx).await?;
    let body: sty_protocol::UpdateProfilePinsRequest = req.json().await?;
    let database = db(&ctx)?;
    let principal = sty_protocol::TokenPrincipal { user };
    let profile =
        features::set_user_profile_pins(&database, &tenant, &principal, body.projects).await?;
    Response::from_json(&profile)
}

pub(crate) async fn follows(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let url = req.url()?;
    let database = db(&ctx)?;
    let principal = sty_protocol::TokenPrincipal { user };
    let projects = features::followed_project_cards(&database, &principal, 200).await?;
    Response::from_json(&paginate_vec(url, projects))
}
