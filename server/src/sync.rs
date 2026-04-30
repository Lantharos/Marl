pub(crate) async fn get_head(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    let workspace = param(&ctx, "workspace")?;
    check_workspace_read_capability(
        &ctx.env,
        &database,
        &tenant,
        &project,
        user.as_deref(),
        &workspace,
    )
    .await?;
    let head = d1::head(&database, &tenant, &project, &workspace).await?;
    Response::from_json(&HeadResponse { head })
}

pub(crate) async fn update_head(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: HeadUpdateRequest = req.json().await?;
    let database = db(&ctx.env)?;
    let workspace = param(&ctx, "workspace")?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    let ok = d1::update_head(&database, &tenant, &project, &workspace, body.expected_head.as_deref(), &body.new_head).await?;
    if ok {
        let _ = crate::developer::emit_project_event(
            &ctx.env,
            &tenant,
            &project,
            "sync",
            serde_json::json!({ "workspace": workspace, "head": body.new_head, "actor": user }),
        )
        .await;
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
    check_workspace_read_capability(
        &ctx.env,
        &database,
        &tenant,
        &project,
        user.as_deref(),
        &workspace,
    )
    .await?;
    let mut entries = d1::workspace_history(&database, &tenant, &project, &workspace).await?;
    enrich_history_entries(&ctx.env, &tenant, &project, &mut entries).await?;
    Response::from_json(&HistoryResponse { entries })
}

pub(crate) async fn project_history(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_read_capability(&ctx.env, &database, &tenant, &project, user.as_deref(), "history:read").await?;
    let mut entries = d1::project_history(&database, &tenant, &project).await?;
    enrich_history_entries(&ctx.env, &tenant, &project, &mut entries).await?;
    Response::from_json(&HistoryResponse { entries })
}

pub(crate) async fn history_entry(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let entry_id = param(&ctx, "entry_id")?;
    let database = db(&ctx.env)?;
    check_project_read_capability(&ctx.env, &database, &tenant, &project, user.as_deref(), "history:read").await?;
    let mut entry = d1::get_history_entry(&database, &tenant, &project, &entry_id).await?;
    if let Some(entry) = &mut entry {
        enrich_history_entry(&ctx.env, &tenant, &project, entry).await?;
    }
    match entry {
        Some(e) => Response::from_json(&e),
        None => json_error(404, "history entry not found"),
    }
}

async fn enrich_history_entries(
    env: &Env,
    tenant: &str,
    project: &str,
    entries: &mut [HistoryEntry],
) -> Result<()> {
    for entry in entries {
        enrich_history_entry(env, tenant, project, entry).await?;
    }
    Ok(())
}

async fn enrich_history_entry(
    env: &Env,
    tenant: &str,
    project: &str,
    entry: &mut HistoryEntry,
) -> Result<()> {
    let Some(snapshot_id) = entry.snapshot_id.as_deref() else {
        return Ok(());
    };
    let store = bucket(env)?;
    let bytes = match r2_bytes(&store, &object_key(tenant, project, snapshot_id)).await {
        Ok(bytes) => bytes,
        Err(_) => return Ok(()),
    };
    let snapshot: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|error| Error::RustError(error.to_string()))?;
    entry.agent = snapshot["agent"].as_str().map(ToOwned::to_owned);
    entry.model = snapshot["agent_model"].as_str().map(ToOwned::to_owned);
    entry.signature = snapshot["signature"].as_object().map(|signature| HistorySignature {
        user: signature
            .get("user")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        key_id: signature
            .get("key_id")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        algorithm: signature
            .get("algorithm")
            .and_then(|value| value.as_str())
            .unwrap_or("ed25519")
            .to_string(),
    });
    Ok(())
}

pub(crate) async fn log_history(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let actor = user.clone();
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: LogHistoryRequest = req.json().await?;
    let database = db(&ctx.env)?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    d1::log_history(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }, &body.kind, &body.message, body.snapshot_id.as_deref()).await?;
    let event = match body.kind.as_str() {
        "ship" => "snapshot.shipped",
        "cram" => "snapshot.crammed",
        _ => "snapshot.saved",
    };
    let _ = crate::developer::emit_project_event(
        &ctx.env,
        &tenant,
        &project,
        event,
        serde_json::json!({
            "workspace": workspace,
            "kind": body.kind,
            "message": body.message,
            "snapshot": body.snapshot_id,
            "actor": actor
        }),
    )
    .await;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn mark_ready(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "workspaces:ready").await?;
    d1::mark_workspace_ready(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }).await?;
    let _ = crate::developer::emit_project_event(
        &ctx.env,
        &tenant,
        &project,
        "workspace.ready",
        serde_json::json!({ "workspace": workspace }),
    )
    .await;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn merge_workspace(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_project_write_capability(&database, &tenant, &project, &user, "maintainer", "workspaces:merge").await?;
    d1::merge_workspace(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }).await?;
    let _ = crate::developer::emit_project_event(
        &ctx.env,
        &tenant,
        &project,
        "workspace.merged",
        serde_json::json!({ "workspace": workspace }),
    )
    .await;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn merge_preview(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_workspace_read_capability(
        &ctx.env,
        &database,
        &tenant,
        &project,
        user.as_deref(),
        &workspace,
    )
    .await?;
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
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "workspaces:write").await?;
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
    check_workspace_read_capability(&ctx.env, &database, &tenant, &project, Some(&user), &workspace).await?;
    let remote_head = d1::head(&database, &tenant, &project, &workspace).await?;
    let relation = compare_relation(&ctx.env, &tenant, &project, body.local_head.as_deref(), remote_head.as_deref()).await?;
    Response::from_json(&CompareResponse { remote_head, relation })
}
