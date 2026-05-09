pub(crate) async fn auth_check(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let profile = d1::user_profile(&database, &user).await?;
    Response::from_json(&AuthCheckResponse {
        ok: true,
        user,
        profile,
    })
}

pub(crate) async fn capabilities(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let _ = optional_auth(&req, &ctx).await?;
    let mut capabilities = sty_protocol::protocol_capabilities();
    capabilities.frontend_url = Some(frontend_origin(&req, &ctx.env));
    Response::from_json(&capabilities)
}

pub(crate) async fn exchange_session(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let body: SessionExchangeRequest = req.json().await?;
    if body.id_token.trim().is_empty() {
        return json_error(400, "missing Ave id token");
    }
    let profile = match verify_ave_id_token(&ctx.env, &body.id_token).await {
        Ok(profile) => profile,
        Err(e) => return json_error(401, &e.to_string()),
    };
    let database = db(&ctx)?;
    let profile = d1::upsert_user_profile(&database, &profile).await?;
    let user = profile.user.clone();
    d1::ensure_account_tenant(&database, &user).await?;
    d1::prune_expired_tokens(&database).await?;
    let expires_at = token_expires_at(&ctx.env);
    let kind = match body.client.as_deref() {
        Some("web") => "web",
        _ => "cli",
    };
    let token = d1::add_token(&database, &user, &expires_at, kind).await?;
    Response::from_json(&TokenResponse {
        token,
        expires_at: Some(expires_at),
    })
}

pub(crate) async fn revoke_session(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let token = bearer_token(&req)?;
    let database = db(&ctx)?;
    d1::revoke_token(&database, &token).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn me(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let profile = d1::user_profile(&database, &user).await?;
    let tenants = d1::tenants(&database, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let settings = d1::user_settings(&database, &user).await?;
    let account_tenant = d1::user_account_tenant(&database, &user).await?;
    let account_setup_required = profile
        .as_ref()
        .and_then(|profile| profile.handle.as_deref())
        .is_some()
        && account_tenant.is_none();
    let account_tenant_suggestions = if account_setup_required {
        d1::account_tenant_suggestions(&database, &user).await?
    } else {
        Vec::new()
    };
    Response::from_json(&MeResponse {
        user,
        profile,
        tenants,
        settings,
        account_tenant,
        account_setup_required,
        account_tenant_suggestions,
    })
}

pub(crate) async fn get_account_settings(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let settings = d1::user_settings(&database, &user).await?;
    Response::from_json(&settings)
}

pub(crate) async fn update_account_settings(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let body: sty_protocol::UpdateUserSettingsRequest = req.json().await?;
    let database = db(&ctx)?;
    let settings = d1::update_user_settings(&database, &user, body).await?;
    Response::from_json(&settings)
}

pub(crate) async fn create_account_tenant(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let body: sty_protocol::CreateAccountTenantRequest = req.json().await?;
    let name = body.name.trim();
    let database = db(&ctx)?;
    let tenant = d1::create_account_tenant(&database, name, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&tenant)
}

pub(crate) async fn create_org(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let body: serde_json::Value = req.json().await?;
    let name = body["name"].as_str().unwrap_or_default();
    sty_protocol::validate_segment(name).map_err(|e| Error::RustError(e.to_string()))?;
    let database = db(&ctx)?;
    let tenant = d1::create_org(&database, name, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&tenant)
}

pub(crate) async fn user_profile_by_handle(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let handle = param(&ctx, "handle")?;
    let database = db(&ctx)?;
    let viewer = optional_auth(&req, &ctx).await?;
    let Some(profile) = d1::user_profile_page_by_handle(&database, &handle, viewer.as_deref()).await? else {
        return json_error(404, "profile not found");
    };
    Response::from_json(&profile)
}

pub(crate) async fn list_projects(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let projects = d1::projects(&database, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&json!({ "projects": projects }))
}

pub(crate) async fn create_project(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: CreateProjectRequest = req.json().await.unwrap_or_default();
    let folder = sty_protocol::normalize_folder(body.folder.as_deref())
        .map_err(|error| Error::RustError(error.to_string()))?;
    let database = db(&ctx)?;
    d1::ensure_project(
        &database,
        &tenant,
        &project,
        folder.as_deref(),
        &sty_protocol::TokenPrincipal { user },
    )
    .await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn list_tenant_folders(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let tenant = param(&ctx, "tenant")?;
    sty_protocol::validate_segment(&tenant).map_err(|e| Error::RustError(e.to_string()))?;
    let database = db(&ctx)?;
    if !d1::tenant_exists(&database, &tenant).await? {
        return json_error(404, "tenant not found");
    }
    let user = optional_auth(&req, &ctx).await?;
    let can_access = match user.as_deref() {
        Some(user) => d1::tenant_access(&database, &tenant, user).await?,
        None => false,
    };
    let folders = d1::tenant_folders(&database, &tenant, !can_access).await?;
    Response::from_json(&sty_protocol::TenantFoldersResponse { folders })
}

pub(crate) async fn create_tenant_folder(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let tenant = param(&ctx, "tenant")?;
    sty_protocol::validate_segment(&tenant).map_err(|e| Error::RustError(e.to_string()))?;
    let body: sty_protocol::CreateTenantFolderRequest = req.json().await?;
    let Some(path) = sty_protocol::normalize_folder_path(Some(&body.path))
        .map_err(|e| Error::RustError(e.to_string()))?
    else {
        return json_error(400, "folder path is required");
    };
    let database = db(&ctx)?;
    if !d1::tenant_exists(&database, &tenant).await? {
        return json_error(404, "tenant not found");
    }
    if !d1::tenant_control(&database, &tenant, &user).await? {
        return json_error(403, "tenant control denied");
    }
    let principal = sty_protocol::TokenPrincipal { user };
    d1::ensure_project_folder(&database, &tenant, &path, &principal).await?;
    let parent = path.rsplit_once('/').map(|(parent, _)| parent.to_string());
    Response::from_json(&sty_protocol::TenantFolder { tenant, path, parent })
}

pub(crate) async fn move_project_folder(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: sty_protocol::MoveProjectFolderRequest = req.json().await?;
    let folder = sty_protocol::normalize_folder_path(body.folder.as_deref())
        .map_err(|e| Error::RustError(e.to_string()))?;
    let database = db(&ctx)?;
    if !d1::project_exists(&database, &tenant, &project).await? {
        return json_error(404, "project not found");
    }
    if !d1::tenant_control(&database, &tenant, &user).await? {
        return json_error(403, "tenant control denied");
    }
    let principal = sty_protocol::TokenPrincipal { user };
    if let Some(folder) = folder.as_deref() {
        d1::ensure_project_folder(&database, &tenant, folder, &principal).await?;
    }
    d1::set_project_folder(&database, &tenant, &project, folder.as_deref()).await?;
    let Some(project) = d1::get_project(&database, &tenant, &project).await? else {
        return json_error(404, "project not found");
    };
    Response::from_json(&project)
}

pub(crate) async fn project_detail(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "workspaces:read").await?;
    let project_info = d1::get_project(&database, &tenant, &project)
        .await?
        .unwrap_or_else(|| ProjectSummary {
            tenant: tenant.clone(),
            project: project.clone(),
            owner: String::new(),
            folder: None,
        });
    let states = d1::workspace_states(&database, &tenant, &project).await?;
    let workspaces: Vec<WorkspaceSummary> = states
        .into_iter()
        .map(|s| WorkspaceSummary {
            name: s.name,
            head: s.head,
        })
        .collect();
    Response::from_json(&ProjectDetailResponse {
        project: project_info,
        workspaces,
    })
}

pub(crate) async fn delete_project(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    if !d1::project_exists(&database, &tenant, &project).await? {
        return json_error(404, "project not found");
    }
    check_project_role(&database, &tenant, &project, &user, "owner").await?;
    delete_prefix(&bucket(&ctx.env)?, &format!("projects/{tenant}/{project}/")).await?;
    d1::delete_project(&database, &tenant, &project).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn list_workspaces(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "workspaces:read").await?;
    let mut workspaces = d1::workspace_states(&database, &tenant, &project).await?;
    enrich_workspace_change_summaries(&ctx, &tenant, &project, &mut workspaces).await.ok();
    Response::from_json(&WorkspaceStateResponse { workspaces })
}

async fn enrich_workspace_change_summaries(
    ctx: &crate::request_context::AppRouteContext,
    tenant: &str,
    project: &str,
    workspaces: &mut [sty_protocol::WorkspaceState],
) -> Result<()> {
    let store = bucket(&ctx.env)?;
    let heads = workspaces
        .iter()
        .map(|workspace| (workspace.name.clone(), workspace.head.clone()))
        .collect::<std::collections::HashMap<_, _>>();
    for workspace in workspaces.iter_mut().filter(|workspace| {
        workspace.name != "main"
            && !matches!(
                workspace.status.as_str(),
                "merged" | "closed" | "not_planned" | "deleted"
            )
    }) {
        let Some(head) = workspace.head.as_deref() else {
            continue;
        };
        let parent = workspace.parent_workspace.as_deref().unwrap_or("main");
        let Some(parent_head) = heads.get(parent).and_then(|head| head.as_deref()) else {
            continue;
        };
        let current = snapshot_blob_map(&store, tenant, project, head).await?;
        let base = snapshot_blob_map(&store, tenant, project, parent_head).await?;
        let summary = change_summary(&store, tenant, project, &current, &base).await?;
        workspace.changed_file_count = summary.files;
        workspace.additions = summary.additions;
        workspace.deletions = summary.deletions;
    }
    Ok(())
}

struct WorkspaceChangeSummary {
    files: u64,
    additions: u64,
    deletions: u64,
}

async fn snapshot_blob_map(
    store: &Bucket,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
) -> Result<std::collections::HashMap<String, String>> {
    let snapshot_bytes = r2_bytes(store, &object_key(tenant, project, snapshot_id)).await?;
    let snapshot: serde_json::Value =
        serde_json::from_slice(&snapshot_bytes).map_err(|error| Error::RustError(error.to_string()))?;
    let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
    let mut entries = Vec::new();
    walk_tree(store, tenant, project, "", &root_tree, &mut entries).await?;
    Ok(entries
        .into_iter()
        .filter(|entry| entry.entry_type == "blob")
        .map(|entry| (entry.path, entry.id))
        .collect())
}

async fn change_summary(
    store: &Bucket,
    tenant: &str,
    project: &str,
    current: &std::collections::HashMap<String, String>,
    base: &std::collections::HashMap<String, String>,
) -> Result<WorkspaceChangeSummary> {
    let mut summary = WorkspaceChangeSummary { files: 0, additions: 0, deletions: 0 };
    for (path, new_id) in current {
        match base.get(path) {
            None => {
                summary.files += 1;
                summary.additions += blob_line_count(store, tenant, project, new_id).await?;
            }
            Some(old_id) if old_id != new_id => {
                summary.files += 1;
                let old_text = blob_text(store, tenant, project, old_id).await?;
                let new_text = blob_text(store, tenant, project, new_id).await?;
                let (additions, deletions) = changed_lines(old_text.as_deref(), new_text.as_deref());
                summary.additions += additions;
                summary.deletions += deletions;
            }
            _ => {}
        }
    }
    for (path, old_id) in base {
        if current.contains_key(path) {
            continue;
        }
        summary.files += 1;
        summary.deletions += blob_line_count(store, tenant, project, old_id).await?;
    }
    Ok(summary)
}

async fn blob_line_count(store: &Bucket, tenant: &str, project: &str, id: &str) -> Result<u64> {
    Ok(blob_text(store, tenant, project, id).await?.map(|text| line_count(&text)).unwrap_or(0))
}

async fn blob_text(store: &Bucket, tenant: &str, project: &str, id: &str) -> Result<Option<String>> {
    let bytes = r2_bytes(store, &object_key(tenant, project, id)).await?;
    Ok(String::from_utf8(bytes).ok())
}

fn changed_lines(old: Option<&str>, new: Option<&str>) -> (u64, u64) {
    let (Some(old), Some(new)) = (old, new) else {
        return (0, 0);
    };
    let old_lines = old.lines().collect::<Vec<_>>();
    let new_lines = new.lines().collect::<Vec<_>>();
    let mut start = 0;
    while start < old_lines.len() && start < new_lines.len() && old_lines[start] == new_lines[start] {
        start += 1;
    }
    let mut old_end = old_lines.len();
    let mut new_end = new_lines.len();
    while old_end > start && new_end > start && old_lines[old_end - 1] == new_lines[new_end - 1] {
        old_end -= 1;
        new_end -= 1;
    }
    ((new_end - start) as u64, (old_end - start) as u64)
}

fn line_count(value: &str) -> u64 {
    if value.is_empty() {
        0
    } else {
        value.lines().count() as u64
    }
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
