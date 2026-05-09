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
    if let Some(state) = d1::workspace_state(&database, &tenant, &project, &workspace).await?
        && state.status == "deleted"
    {
        return json_error(409, "workspace was deleted remotely");
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
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace);
    let Some(state) = state else {
        return json_error(404, "workspace not found");
    };
    if workspace == "main" {
        return json_error(404, "workspace not found");
    }
    if matches!(state.status.as_str(), "merged" | "closed" | "not_planned") {
        return json_error(409, "workspace is closed");
    }
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
    let states = d1::workspace_states(&database, &tenant, &project).await?;
    let Some(state) = states.iter().find(|item| item.name == workspace) else {
        return json_error(404, "workspace not found");
    };
    if workspace == "main" {
        return json_error(404, "workspace not found");
    }
    if !state.is_ready || state.status != "ready" {
        return json_error(409, "workspace is not ready to merge");
    }
    if states.iter().any(|item| {
        item.parent_workspace.as_deref() == Some(workspace.as_str())
            && !matches!(item.status.as_str(), "merged" | "closed" | "not_planned")
    }) {
        return json_error(409, "workspace has unmerged child workspaces");
    }
    let workspace_head = state
        .head
        .clone()
        .ok_or_else(|| Error::RustError("workspace has no head".to_string()))?;
    let parent = state.parent_workspace.as_deref().unwrap_or("main").to_string();
    let parent_head = d1::head(&database, &tenant, &project, &parent).await?;
    let merge_head = create_cram_merge_snapshot(
        &ctx.env,
        &database,
        &tenant,
        &project,
        &workspace,
        &parent,
        &workspace_head,
        parent_head.as_deref(),
        &user,
    )
    .await?;
    let updated = d1::update_head(
        &database,
        &tenant,
        &project,
        &parent,
        parent_head.as_deref(),
        &merge_head,
    )
    .await?;
    if !updated {
        return json_error(409, "parent workspace head changed");
    }
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    d1::log_history(
        &database,
        &tenant,
        &project,
        &parent,
        &principal,
        "merge",
        &format!("merged workspace {workspace} into {parent}"),
        Some(&merge_head),
        None,
    )
    .await?;
    d1::merge_workspace(
        &database,
        &tenant,
        &project,
        &workspace,
        &principal,
        &merge_head,
    )
    .await?;
    let _ = crate::developer::emit_project_event(&ctx,
        &tenant,
        &project,
        "workspace.merged",
        serde_json::json!({ "workspace": workspace, "parent": parent, "head": merge_head }),
    );
    Response::from_json(&serde_json::json!({
        "ok": true,
        "parent_workspace": parent,
        "head": merge_head,
    }))
}

pub(crate) async fn update_workspace_labels(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await.unwrap_or_default();
    let labels = body["labels"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(|label| label.trim().to_string())
                .filter(|label| !label.is_empty())
                .take(8)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "workspaces:write").await?;
    if !d1::workspace_exists(&database, &tenant, &project, &workspace).await? {
        return json_error(404, "workspace not found");
    }
    d1::set_workspace_labels(&database, &tenant, &project, &workspace, &labels).await?;
    Response::from_json(&serde_json::json!({ "labels": labels }))
}

pub(crate) async fn close_workspace(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await.unwrap_or_default();
    let status = match body["status"].as_str().unwrap_or("closed") {
        "not_planned" => "not_planned",
        _ => "closed",
    };
    let reason = body["reason"].as_str().map(str::trim).filter(|value| !value.is_empty());
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "maintainer", "workspaces:write").await?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace);
    let Some(state) = state else {
        return json_error(404, "workspace not found");
    };
    if workspace == "main" {
        return json_error(404, "workspace not found");
    }
    if state.status == "merged" {
        return json_error(409, "merged workspaces cannot be closed");
    }
    d1::close_workspace(&database, &tenant, &project, &workspace, status, &sty_protocol::TokenPrincipal { user }, reason).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn reopen_workspace(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await.unwrap_or_default();
    let reason = body["reason"].as_str().map(str::trim).filter(|value| !value.is_empty());
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "maintainer", "workspaces:write").await?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace);
    let Some(state) = state else {
        return json_error(404, "workspace not found");
    };
    if workspace == "main" {
        return json_error(404, "workspace not found");
    }
    if matches!(state.status.as_str(), "merged" | "deleted") {
        return json_error(409, "workspace cannot be reopened");
    }
    d1::reopen_workspace(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }, reason).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn delete_draft_workspace(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "workspaces:write").await?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace);
    let Some(state) = state else {
        return json_error(404, "workspace not found");
    };
    if workspace == "main" || state.is_ready || !matches!(state.status.as_str(), "active" | "draft") {
        return json_error(409, "only draft workspaces can be deleted");
    }
    d1::delete_draft_workspace(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }).await?;
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
    let parent = ws.parent_workspace.as_deref().unwrap_or("main");
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
    files.sort_by(|a, b| a.path.cmp(&b.path));
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
    let state = d1::workspace_state(&database, &tenant, &project, &workspace).await?;
    if let Some(state) = state.as_ref()
        && state.status == "merged"
    {
        let parent_workspace = state
            .parent_workspace
            .clone()
            .unwrap_or_else(|| "main".to_string());
        let parent_head = d1::head(&database, &tenant, &project, &parent_workspace).await?;
        return Response::from_json(&CompareResponse {
            remote_head: state.head.clone(),
            relation: "workspace_merged".to_string(),
            workspace_status: Some("merged".to_string()),
            parent_workspace: Some(parent_workspace),
            parent_head,
        });
    }
    if let Some(state) = state.as_ref()
        && state.status == "deleted"
    {
        let parent_workspace = state
            .parent_workspace
            .clone()
            .unwrap_or_else(|| "main".to_string());
        let parent_head = d1::head(&database, &tenant, &project, &parent_workspace).await?;
        return Response::from_json(&CompareResponse {
            remote_head: state.head.clone(),
            relation: "workspace_deleted".to_string(),
            workspace_status: Some("deleted".to_string()),
            parent_workspace: Some(parent_workspace),
            parent_head,
        });
    }
    let remote_head = state
        .and_then(|state| state.head)
        .or(d1::head(&database, &tenant, &project, &workspace).await?);
    let relation = compare_relation(&ctx.env, &tenant, &project, body.local_head.as_deref(), remote_head.as_deref()).await?;
    Response::from_json(&CompareResponse {
        remote_head,
        relation,
        workspace_status: None,
        parent_workspace: None,
        parent_head: None,
    })
}

async fn create_cram_merge_snapshot(
    env: &Env,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    parent: &str,
    workspace_head: &str,
    parent_head: Option<&str>,
    actor: &str,
) -> Result<String> {
    validate_object_id(workspace_head)?;
    if let Some(parent_head) = parent_head {
        validate_object_id(parent_head)?;
        match d1::object_kind(database, tenant, project, parent_head).await? {
            Some(kind) if kind == "snapshot" => {}
            Some(_) => return Err(Error::RustError("parent head is not a snapshot".to_string())),
            None => return Err(Error::RustError("parent head is missing".to_string())),
        }
    }
    match d1::object_kind(database, tenant, project, workspace_head).await? {
        Some(kind) if kind == "snapshot" => {}
        Some(_) => return Err(Error::RustError("workspace head is not a snapshot".to_string())),
        None => return Err(Error::RustError("workspace head is missing".to_string())),
    }
    let store = bucket(env)?;
    let workspace_snapshot_bytes = r2_bytes(&store, &object_key(tenant, project, workspace_head)).await?;
    let workspace_snapshot: serde_json::Value =
        serde_json::from_slice(&workspace_snapshot_bytes).map_err(|error| Error::RustError(error.to_string()))?;
    let root_tree = workspace_snapshot["root_tree"]
        .as_str()
        .ok_or_else(|| Error::RustError("workspace snapshot root_tree is missing".to_string()))?;
    validate_object_id(root_tree)?;
    validate_tree_closure(&store, database, tenant, project, root_tree).await?;
    let message = workspace_snapshot["message"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("merge {workspace}: {value}"))
        .unwrap_or_else(|| format!("merge workspace {workspace} into {parent}"));
    let intents = workspace_snapshot["intents"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let time: String = js_sys::Date::new_0().to_iso_string().into();
    let mut snapshot = serde_json::json!({
        "id": "",
        "parents": parent_head.into_iter().collect::<Vec<_>>(),
        "kind": "cram",
        "author": actor,
        "agent": null,
        "agent_model": null,
        "time": time,
        "message": message,
        "root_tree": root_tree,
        "workspace_id": parent,
        "intents": intents,
    });
    let canonical_bytes =
        serde_json::to_vec(&snapshot).map_err(|error| Error::RustError(error.to_string()))?;
    let snapshot_id = object_digest_for_kind(&canonical_bytes, "snapshot")?;
    snapshot["id"] = serde_json::json!(snapshot_id);
    let bytes = serde_json::to_vec(&snapshot).map_err(|error| Error::RustError(error.to_string()))?;
    put_bytes(&store, &object_key(tenant, project, &snapshot_id), bytes.clone()).await?;
    d1::record_object(database, tenant, project, &snapshot_id, "snapshot", bytes.len()).await?;
    ensure_snapshot_refs_uploaded(env, database, tenant, project, &snapshot_id).await?;
    Ok(snapshot_id)
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
