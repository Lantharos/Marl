use super::prelude::*;
pub(crate) async fn get_settings(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_access(&database, &tenant, &project, user.as_deref()).await?;
    let principal = user
        .as_ref()
        .map(|user| sty_protocol::TokenPrincipal { user: user.clone() });
    let mut settings =
        features::project_settings(&database, &tenant, &project, principal.as_ref()).await?;
    if !settings_can_read_source_boundaries(&database, &tenant, &project, user.as_deref()).await? {
        settings.path_visibility = vec![];
        redact_ci_settings_for_viewers(&mut settings.ci);
    }
    Response::from_json(&settings)
}

pub(crate) async fn update_settings(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: UpdateSettingsRequest = req.json().await?;
    let database = db(&ctx)?;
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    check_project_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "settings:write",
    )
    .await?;
    let current =
        features::project_settings(&database, &tenant, &project, Some(&principal)).await?;
    let visibility = body.visibility.unwrap_or(current.visibility);
    let default_workspace = body.default_workspace.unwrap_or(current.default_workspace);
    let settings = features::update_project_settings(
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
        body.path_visibility,
        body.components,
        body.ci,
        body.archived,
        body.public_releases,
    )
    .await?;
    features::record_audit_event(
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
            "path_visibility": settings.path_visibility.clone(),
            "components": settings.components.clone(),
            "ci": settings.ci.clone(),
        }),
    )
    .await?;
    Response::from_json(&settings)
}

pub(crate) async fn follow_project(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_access(&database, &tenant, &project, Some(&user)).await?;
    if !is_public_project(&database, &tenant, &project).await? {
        return json_error(403, "only public projects can be followed");
    }
    let is_following = features::follow_project(
        &database,
        &tenant,
        &project,
        &sty_protocol::TokenPrincipal { user },
    )
    .await?;
    Response::from_json(&sty_protocol::FollowResponse {
        is_following,
        can_follow: true,
    })
}

pub(crate) async fn unfollow_project(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_access(&database, &tenant, &project, Some(&user)).await?;
    let can_follow = is_public_project(&database, &tenant, &project).await?;
    let is_following = features::unfollow_project(
        &database,
        &tenant,
        &project,
        &sty_protocol::TokenPrincipal { user },
    )
    .await?;
    Response::from_json(&sty_protocol::FollowResponse {
        is_following,
        can_follow,
    })
}

pub(crate) async fn project_follow(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_access(&database, &tenant, &project, Some(&user)).await?;
    let principal = sty_protocol::TokenPrincipal { user };
    let can_follow = is_public_project(&database, &tenant, &project).await?;
    let is_following = if can_follow {
        features::is_following(&database, &tenant, &project, Some(&principal)).await?
    } else {
        false
    };
    Response::from_json(&sty_protocol::FollowResponse {
        is_following,
        can_follow,
    })
}

async fn is_public_project(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
) -> Result<bool> {
    Ok(matches!(
        features::project_visibility(database, tenant, project).await?,
        Some(visibility) if visibility == "public"
    ))
}

async fn settings_can_read_source_boundaries(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<bool> {
    let Some(user) = user else {
        return Ok(false);
    };
    features::project_role_allows(database, tenant, project, user, "maintainer").await
}

fn redact_ci_settings_for_viewers(ci: &mut sty_protocol::ProjectCiSettings) {
    for command in &mut ci.commands {
        command.secrets.clear();
        command.env.clear();
    }
    for block in &mut ci.blocks {
        block.secrets.clear();
        block.env.clear();
    }
}
