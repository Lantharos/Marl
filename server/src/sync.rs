pub(crate) async fn get_head(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    check_workspace_read_capability(&database,
        &tenant,
        &project,
        user.as_deref(),
        &workspace,
    )
    .await?;
    let head = d1::head(&database, &tenant, &project, &workspace).await?;
    Response::from_json(&HeadResponse { head })
}

pub(crate) async fn update_head(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: HeadUpdateRequest = req.json().await?;
    let database = db(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    if let Some(expected) = body.expected_head.as_deref() {
        validate_object_id(expected)?;
    }
    validate_object_id(&body.new_head)?;
    match d1::object_kind(&database, &tenant, &project, &body.new_head).await? {
        Some(kind) if kind == "snapshot" => {}
        Some(_) => return json_error(400, "workspace head must point to a snapshot object"),
        None => return json_error(400, "workspace head object is missing"),
    }
    ensure_snapshot_refs_uploaded(&ctx.env, &database, &tenant, &project, &body.new_head).await?;
    let ok = d1::update_head(&database, &tenant, &project, &workspace, body.expected_head.as_deref(), &body.new_head).await?;
    if ok {
        let _ = crate::developer::emit_project_event(&ctx,
            &tenant,
            &project,
            "sync",
            serde_json::json!({ "workspace": workspace, "head": body.new_head, "actor": user }),
        );
        Response::from_json(&OkResponse { ok: true })
    } else {
        json_error(409, "workspace head changed")
    }
}

pub(crate) async fn workspace_history(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_workspace_read_capability(&database,
        &tenant,
        &project,
        user.as_deref(),
        &workspace,
    )
    .await?;
    let limit = query_limit(&req, 100, 500)?;
    let entries =
        d1::workspace_history_with_limit(&database, &tenant, &project, &workspace, Some(limit))
            .await?;
    Response::from_json(&HistoryResponse { entries })
}

pub(crate) async fn project_history(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "history:read").await?;
    let limit = query_limit(&req, 100, 500)?;
    let entries = d1::project_history_with_limit(&database, &tenant, &project, Some(limit)).await?;
    Response::from_json(&HistoryResponse { entries })
}

pub(crate) async fn history_entry(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let entry_id = param(&ctx, "entry_id")?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "history:read").await?;
    let mut entry = d1::get_history_entry(&database, &tenant, &project, &entry_id).await?;
    if let Some(entry) = &mut entry {
        enrich_history_entry(&ctx.env, &tenant, &project, entry).await?;
    }
    match entry {
        Some(e) => Response::from_json(&e),
        None => json_error(404, "history entry not found"),
    }
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
    let metadata = history_metadata_from_snapshot(&snapshot);
    entry.agent = metadata.agent;
    entry.model = metadata.model;
    entry.signature = metadata.signature;
    Ok(())
}

async fn snapshot_history_metadata(
    env: &Env,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
) -> Result<d1::HistorySnapshotMetadata> {
    let store = bucket(env)?;
    let bytes = r2_bytes(&store, &object_key(tenant, project, snapshot_id)).await?;
    let snapshot: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|error| Error::RustError(error.to_string()))?;
    Ok(history_metadata_from_snapshot(&snapshot))
}

fn history_metadata_from_snapshot(snapshot: &serde_json::Value) -> d1::HistorySnapshotMetadata {
    d1::HistorySnapshotMetadata {
        agent: snapshot["agent"].as_str().map(ToOwned::to_owned),
        model: snapshot["agent_model"].as_str().map(ToOwned::to_owned),
        signature: snapshot["signature"].as_object().map(|signature| HistorySignature {
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
        }),
    }
}

pub(crate) async fn log_history(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let actor = user.clone();
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: LogHistoryRequest = req.json().await?;
    let database = db(&ctx)?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    if let Some(snapshot_id) = body.snapshot_id.as_deref() {
        validate_object_id(snapshot_id)?;
        match d1::object_kind(&database, &tenant, &project, snapshot_id).await? {
            Some(kind) if kind == "snapshot" => {}
            Some(_) => return json_error(400, "history snapshot must point to a snapshot object"),
            None => return json_error(400, "history snapshot object is missing"),
        }
    }
    let metadata = if let Some(snapshot_id) = body.snapshot_id.as_deref() {
        Some(snapshot_history_metadata(&ctx.env, &tenant, &project, snapshot_id).await?)
    } else {
        None
    };
    d1::log_history(
        &database,
        &tenant,
        &project,
        &workspace,
        &sty_protocol::TokenPrincipal { user },
        &body.kind,
        &body.message,
        body.snapshot_id.as_deref(),
        metadata.as_ref(),
    )
    .await?;
    let event = match body.kind.as_str() {
        "ship" => "snapshot.shipped",
        "cram" => "snapshot.crammed",
        _ => "snapshot.saved",
    };
    let _ = crate::developer::emit_project_event(&ctx,
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
    );
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn mark_ready(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "workspaces:ready").await?;
    d1::mark_workspace_ready(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }).await?;
    let _ = crate::developer::emit_project_event(&ctx,
        &tenant,
        &project,
        "workspace.ready",
        serde_json::json!({ "workspace": workspace }),
    );
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn merge_workspace(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "maintainer", "workspaces:merge").await?;
    d1::merge_workspace(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }).await?;
    let _ = crate::developer::emit_project_event(&ctx,
        &tenant,
        &project,
        "workspace.merged",
        serde_json::json!({ "workspace": workspace }),
    );
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn merge_preview(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_workspace_read_capability(&database,
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

pub(crate) async fn set_parent(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "workspaces:write").await?;
    let parent = body["parent_workspace"].as_str();
    d1::set_parent_workspace(&database, &tenant, &project, &workspace, parent).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn compare(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: CompareRequest = req.json().await?;
    let database = db(&ctx)?;
    check_workspace_read_capability(&database, &tenant, &project, Some(&user), &workspace).await?;
    let remote_head = d1::head(&database, &tenant, &project, &workspace).await?;
    let relation = compare_relation(&ctx.env, &tenant, &project, body.local_head.as_deref(), remote_head.as_deref()).await?;
    Response::from_json(&CompareResponse { remote_head, relation })
}

async fn ensure_snapshot_refs_uploaded(
    env: &Env,
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
) -> Result<()> {
    let store = bucket(env)?;
    let snapshot_bytes = r2_bytes(&store, &object_key(tenant, project, snapshot_id)).await?;
    validate_snapshot_signature(db, &snapshot_bytes)
        .await
        .map_err(|reason| Error::RustError(format!("invalid snapshot signature: {reason}")))?;
    let snapshot: serde_json::Value =
        serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
    let root_tree = snapshot["root_tree"]
        .as_str()
        .ok_or_else(|| Error::RustError("snapshot root_tree is missing".to_string()))?;
    validate_object_id(root_tree)?;
    match d1::object_kind(db, tenant, project, root_tree).await? {
        Some(kind) if kind == "tree" => {}
        Some(_) => return Err(Error::RustError("snapshot root_tree is not a tree".to_string())),
        None => return Err(Error::RustError("snapshot root_tree is missing".to_string())),
    }
    validate_tree_closure(&store, db, tenant, project, root_tree).await?;
    let Some(parents) = snapshot["parents"].as_array() else {
        return Err(Error::RustError("snapshot parents are missing".to_string()));
    };
    for parent in parents {
        let parent_id = parent
            .as_str()
            .ok_or_else(|| Error::RustError("snapshot parent is invalid".to_string()))?;
        validate_object_id(parent_id)?;
        match d1::object_kind(db, tenant, project, parent_id).await? {
            Some(kind) if kind == "snapshot" => {}
            Some(_) => return Err(Error::RustError("snapshot parent is not a snapshot".to_string())),
            None => return Err(Error::RustError("snapshot parent is missing".to_string())),
        }
    }
    Ok(())
}
