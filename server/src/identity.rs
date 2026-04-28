pub(crate) async fn auth_check(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let database = db(&ctx.env)?;
    let profile = d1::user_profile(&database, &user).await?;
    Response::from_json(&AuthCheckResponse {
        ok: true,
        user,
        profile,
    })
}

pub(crate) async fn capabilities(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = optional_auth(&req, &ctx.env).await?;
    Response::from_json(&sty_protocol::protocol_capabilities())
}

pub(crate) async fn exchange_session(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let body: SessionExchangeRequest = req.json().await?;
    if body.id_token.trim().is_empty() {
        return json_error(400, "missing Ave id token");
    }
    let profile = match verify_ave_id_token(&ctx.env, &body.id_token).await {
        Ok(profile) => profile,
        Err(e) => return json_error(401, &e.to_string()),
    };
    let database = db(&ctx.env)?;
    let profile = d1::upsert_user_profile(&database, &profile).await?;
    let user = profile.user.clone();
    d1::ensure_account_tenant(&database, &user).await?;
    d1::prune_expired_tokens(&database).await?;
    let expires_at = token_expires_at(&ctx.env);
    let token = d1::add_token(&database, &user, &expires_at).await?;
    Response::from_json(&TokenResponse {
        token,
        expires_at: Some(expires_at),
    })
}

pub(crate) async fn revoke_session(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let token = bearer_token(&req)?;
    let database = db(&ctx.env)?;
    d1::revoke_token(&database, &token).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn me(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let database = db(&ctx.env)?;
    let profile = d1::user_profile(&database, &user).await?;
    let tenants = d1::tenants(&database, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    Response::from_json(&MeResponse { user, profile, tenants })
}

pub(crate) async fn create_org(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let body: serde_json::Value = req.json().await?;
    let name = body["name"].as_str().unwrap_or_default();
    sty_protocol::validate_segment(name).map_err(|e| Error::RustError(e.to_string()))?;
    let database = db(&ctx.env)?;
    let tenant = d1::create_org(&database, name, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&tenant)
}

pub(crate) async fn list_projects(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let database = db(&ctx.env)?;
    let projects = d1::projects(&database, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&json!({ "projects": projects }))
}

pub(crate) async fn create_project(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn project_detail(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let project_info = d1::get_project(&database, &tenant, &project).await?;
    let owner = project_info.map(|p| p.owner).unwrap_or_default();
    let states = d1::workspace_states(&database, &tenant, &project).await?;
    let workspaces: Vec<WorkspaceSummary> = states
        .into_iter()
        .map(|s| WorkspaceSummary {
            name: s.name,
            head: s.head,
        })
        .collect();
    Response::from_json(&ProjectDetailResponse {
        project: ProjectSummary {
            tenant: tenant.clone(),
            project: project.clone(),
            owner,
        },
        workspaces,
    })
}

pub(crate) async fn list_workspaces(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let workspaces = d1::workspace_states(&database, &tenant, &project).await?;
    Response::from_json(&WorkspaceStateResponse { workspaces })
}

fn token_expires_at(env: &Env) -> String {
    let ttl_seconds = env
        .var("STY_TOKEN_TTL_SECONDS")
        .ok()
        .and_then(|value| value.to_string().parse::<f64>().ok())
        .filter(|value| *value > 0.0)
        .unwrap_or(60.0 * 60.0 * 24.0 * 30.0);
    let now = js_sys::Date::new_0();
    js_sys::Date::new(&wasm_bindgen::JsValue::from_f64(
        now.get_time() + ttl_seconds * 1000.0,
    ))
    .to_iso_string()
    .into()
}
