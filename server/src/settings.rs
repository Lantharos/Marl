pub(crate) async fn get_settings(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_access(&database, &tenant, &project, user.as_deref()).await?;
    let principal = user
        .map(|user| sty_protocol::TokenPrincipal { user });
    let settings = d1::project_settings(&database, &tenant, &project, principal.as_ref()).await?;
    Response::from_json(&settings)
}

pub(crate) async fn update_settings(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: UpdateSettingsRequest = req.json().await?;
    let database = db(&ctx)?;
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    check_project_capability(&database, &tenant, &project, &user, "maintainer", "settings:write").await?;
    let current = d1::project_settings(&database, &tenant, &project, Some(&principal)).await?;
    let visibility = body.visibility.unwrap_or(current.visibility);
    let default_workspace = body
        .default_workspace
        .unwrap_or(current.default_workspace);
    let settings = d1::update_project_settings(
        &database,
        &tenant,
        &project,
        &principal,
        &visibility,
        &default_workspace,
        body.appearance,
        body.navbar_items,
        body.panels,
        body.merge_rules,
        body.protected_workspaces,
        body.ci,
        body.archived,
        body.public_releases,
    )
    .await?;
    d1::record_audit_event(
        &database,
        &tenant,
        &project,
        &user,
        "project.settings_update",
        "project",
        &project,
        serde_json::json!({
            "visibility": settings.visibility.clone(),
            "default_workspace": settings.default_workspace.clone(),
            "public_releases": settings.public_releases,
            "merge_rules": settings.merge_rules.clone(),
            "protected_workspaces": settings.protected_workspaces.clone(),
            "ci": settings.ci.clone(),
        }),
    )
    .await?;
    Response::from_json(&settings)
}

pub(crate) async fn follow_project(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_access(&database, &tenant, &project, Some(&user)).await?;
    if !is_public_project(&database, &tenant, &project).await? {
        return json_error(403, "only public projects can be followed");
    }
    let is_following =
        d1::follow_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user })
            .await?;
    Response::from_json(&sty_protocol::FollowResponse {
        is_following,
        can_follow: true,
    })
}

pub(crate) async fn unfollow_project(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_access(&database, &tenant, &project, Some(&user)).await?;
    let can_follow = is_public_project(&database, &tenant, &project).await?;
    let is_following =
        d1::unfollow_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user })
            .await?;
    Response::from_json(&sty_protocol::FollowResponse {
        is_following,
        can_follow,
    })
}

pub(crate) async fn project_follow(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_access(&database, &tenant, &project, Some(&user)).await?;
    let principal = sty_protocol::TokenPrincipal { user };
    let can_follow = is_public_project(&database, &tenant, &project).await?;
    let is_following = if can_follow {
        d1::is_following(&database, &tenant, &project, Some(&principal)).await?
    } else {
        false
    };
    Response::from_json(&sty_protocol::FollowResponse {
        is_following,
        can_follow,
    })
}

async fn is_public_project(database: &crate::request_context::Database, tenant: &str, project: &str) -> Result<bool> {
    Ok(matches!(
        d1::project_visibility(database, tenant, project).await?,
        Some(visibility) if visibility == "public"
    ))
}
