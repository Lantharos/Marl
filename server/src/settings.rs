pub(crate) async fn get_settings(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    d1::ensure_project(&database, &tenant, &project, &principal).await?;
    let settings = d1::project_settings(&database, &tenant, &project, &principal).await?;
    Response::from_json(&settings)
}

pub(crate) async fn update_settings(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: UpdateSettingsRequest = req.json().await?;
    let database = db(&ctx.env)?;
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    d1::ensure_project(&database, &tenant, &project, &principal).await?;
    let visibility = body.visibility.as_deref().unwrap_or("private");
    let default_workspace = body.default_workspace.as_deref().unwrap_or("main");
    let settings = d1::update_project_settings(&database, &tenant, &project, &principal, visibility, default_workspace, body.navbar_items, body.panels).await?;
    Response::from_json(&settings)
}

pub(crate) async fn star_project(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let (is_starred, starred_count) = d1::star_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&StarResponse { is_starred, starred_count })
}

pub(crate) async fn unstar_project(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let (is_starred, starred_count) = d1::unstar_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&StarResponse { is_starred, starred_count })
}
