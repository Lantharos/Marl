pub(crate) async fn home(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let database = db(&ctx.env)?;
    let principal = sty_protocol::TokenPrincipal { user };
    let projects = d1::dashboard_project_cards(&database, &principal).await?;
    let following = d1::followed_project_cards(&database, &principal, 25).await?;
    let releases = d1::followed_release_feed(&database, &principal, 25).await?;
    Response::from_json(&sty_protocol::HomeResponse {
        projects,
        following,
        releases,
        discover: vec![],
    })
}

pub(crate) async fn discover_projects(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = optional_auth(&req, &ctx.env).await?;
    let url = req.url()?;
    let query = url
        .query_pairs()
        .find_map(|(key, value)| (key == "q").then(|| value.to_string()))
        .unwrap_or_default();
    let database = db(&ctx.env)?;
    let projects = d1::public_project_cards(&database, &query, 200).await?;
    Response::from_json(&paginate_vec(url, projects))
}

pub(crate) async fn follows(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let url = req.url()?;
    let database = db(&ctx.env)?;
    let principal = sty_protocol::TokenPrincipal { user };
    let projects = d1::followed_project_cards(&database, &principal, 200).await?;
    Response::from_json(&paginate_vec(url, projects))
}
