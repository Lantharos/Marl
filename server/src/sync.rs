pub(crate) async fn get_head(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let workspace = param(&ctx, "workspace")?;
    let head = d1::head(&database, &tenant, &project, &workspace).await?;
    Response::from_json(&HeadResponse { head })
}

pub(crate) async fn update_head(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: HeadUpdateRequest = req.json().await?;
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let workspace = param(&ctx, "workspace")?;
    let ok = d1::update_head(&database, &tenant, &project, &workspace, body.expected_head.as_deref(), &body.new_head).await?;
    if ok {
        Response::from_json(&OkResponse { ok: true })
    } else {
        json_error(409, "workspace head changed")
    }
}

pub(crate) async fn workspace_history(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let entries = d1::workspace_history(&database, &tenant, &project, &workspace).await?;
    Response::from_json(&HistoryResponse { entries })
}

pub(crate) async fn project_history(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let entries = d1::project_history(&database, &tenant, &project).await?;
    Response::from_json(&HistoryResponse { entries })
}

pub(crate) async fn history_entry(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let entry_id = param(&ctx, "entry_id")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let entry = d1::get_history_entry(&database, &tenant, &project, &entry_id).await?;
    match entry {
        Some(e) => Response::from_json(&e),
        None => json_error(404, "history entry not found"),
    }
}

pub(crate) async fn log_history(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: LogHistoryRequest = req.json().await?;
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    d1::log_history(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }, &body.kind, &body.message, body.snapshot_id.as_deref()).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn mark_ready(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    d1::mark_workspace_ready(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn merge_workspace(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    d1::merge_workspace(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn merge_preview(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let states = d1::workspace_states(&database, &tenant, &project).await?;
    let ws = states.into_iter().find(|s| s.name == workspace)
        .ok_or_else(|| Error::RustError("workspace not found".to_string()))?;
    let parent = ws.parent_workspace.as_ref()
        .ok_or_else(|| Error::RustError("workspace has no parent".to_string()))?;
    let head = d1::head(&database, &tenant, &project, &workspace).await?;
    let parent_head = d1::head(&database, &tenant, &project, parent).await?;
    let store = bucket(&ctx.env)?;
    let mut current_entries = Vec::new();
    if let Some(h) = head {
        let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &h)).await?;
        let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
        walk_tree(&store, &tenant, &project, "", &root_tree, &mut current_entries).await?;
    }
    let mut parent_entries = Vec::new();
    if let Some(h) = parent_head {
        let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &h)).await?;
        let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
        walk_tree(&store, &tenant, &project, "", &root_tree, &mut parent_entries).await?;
    }
    let current_map: std::collections::HashMap<String, String> = current_entries.into_iter().filter(|e| e.entry_type == "blob").map(|e| (e.path, e.id)).collect();
    let parent_map: std::collections::HashMap<String, String> = parent_entries.into_iter().filter(|e| e.entry_type == "blob").map(|e| (e.path, e.id)).collect();
    let mut files = Vec::new();
    for (path, id) in &current_map {
        if !parent_map.contains_key(path) {
            files.push(sty_protocol::ChangedFile { path: path.clone(), change_type: "added".to_string(), old_id: None, new_id: Some(id.clone()) });
        } else if parent_map.get(path) != Some(id) {
            files.push(sty_protocol::ChangedFile { path: path.clone(), change_type: "modified".to_string(), old_id: parent_map.get(path).cloned(), new_id: Some(id.clone()) });
        }
    }
    for (path, id) in &parent_map {
        if !current_map.contains_key(path) {
            files.push(sty_protocol::ChangedFile { path: path.clone(), change_type: "deleted".to_string(), old_id: Some(id.clone()), new_id: None });
        }
    }
    Response::from_json(&sty_protocol::MergePreviewResponse { files })
}

pub(crate) async fn set_parent(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await?;
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let parent = body["parent_workspace"].as_str();
    d1::set_parent_workspace(&database, &tenant, &project, &workspace, parent).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn compare(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: CompareRequest = req.json().await?;
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let remote_head = d1::head(&database, &tenant, &project, &workspace).await?;
    let relation = compare_relation(&ctx.env, &tenant, &project, body.local_head.as_deref(), remote_head.as_deref()).await?;
    Response::from_json(&CompareResponse { remote_head, relation })
}
