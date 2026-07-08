use super::prelude::*;
pub(crate) async fn get_head(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    check_workspace_read_capability(&database, &tenant, &project, user.as_deref(), &workspace)
        .await?;
    let head = features::head(&database, &tenant, &project, &workspace).await?;
    Response::from_json(&HeadResponse { head })
}

pub(crate) async fn update_head(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: HeadUpdateRequest = req.json().await?;
    let database = db(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    let settings =
        features::project_settings(&database, &tenant, &project, Some(&principal)).await?;
    if settings
        .protected_workspaces
        .iter()
        .any(|protected| protected == &workspace)
    {
        return json_error(
            403,
            "workspace is protected; merge a ready workspace instead",
        );
    }
    if let Some(expected) = body.expected_head.as_deref() {
        validate_object_id(expected)?;
    }
    validate_object_id(&body.new_head)?;
    match features::object_kind_resolved(
        &ctx.env,
        &database,
        &tenant,
        &project,
        &body.new_head,
    )
    .await?
    {
        Some(kind) if kind == "snapshot" => {}
        Some(_) => return json_error(400, "workspace head must point to a snapshot object"),
        None => return json_error(400, "workspace head object is missing"),
    }
    if let Some(state) = features::workspace_state(&database, &tenant, &project, &workspace).await?
        && state.status == "deleted"
    {
        return json_error(409, "workspace was deleted remotely");
    }
    ensure_snapshot_refs_uploaded(
        &ctx.env,
        &database,
        &tenant,
        &project,
        &workspace,
        &body.new_head,
        body.expected_head.as_deref(),
        body.objects_verified,
    )
    .await?;
    let ok = if body.force {
        features::force_update_head(
            &database,
            &tenant,
            &project,
            &workspace,
            &body.new_head,
            Some(&user),
        )
        .await?
    } else {
        features::update_head(
            &database,
            &tenant,
            &project,
            &workspace,
            body.expected_head.as_deref(),
            &body.new_head,
            Some(&user),
        )
        .await?
    };
    if ok {
        if body.force {
            features::record_audit_event(
                &database,
                &tenant,
                &project,
                &user,
                "workspace.force_update_head",
                "workspace",
                &workspace,
                serde_json::json!({ "expected_head": body.expected_head.clone(), "new_head": body.new_head.clone() }),
            )
            .await?;
        }
        let app = ctx.data.clone();
        let env = ctx.env.clone();
        let tenant_owned = tenant.clone();
        let project_owned = project.clone();
        let workspace_owned = workspace.clone();
        let new_head = body.new_head.clone();
        let user_owned = user.clone();
        ctx.data.wait_until(async move {
            let database = app.database();
            if let Err(error) = finish_head_update_side_effects(
                &env,
                database,
                &app,
                &tenant_owned,
                &project_owned,
                &workspace_owned,
                &new_head,
                &user_owned,
            )
            .await
            {
                console_error!("head update side effects failed: {error}");
            }
        });
        Response::from_json(&OkResponse { ok: true })
    } else {
        json_error(409, "workspace head changed")
    }
}

pub(crate) async fn workspace_history(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_workspace_read_capability(&database, &tenant, &project, user.as_deref(), &workspace)
        .await?;
    let limit = query_limit(&req, 100, 500)?;
    let entries = features::workspace_history_with_limit(
        &database,
        &tenant,
        &project,
        &workspace,
        Some(limit),
    )
    .await?;
    let entries =
        enrich_history_components(&ctx.env, &database, &tenant, &project, entries).await?;
    Response::from_json(&HistoryResponse { entries })
}

pub(crate) async fn project_history(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        "history:read",
    )
    .await?;
    let limit = query_limit(&req, 100, 500)?;
    let entries =
        features::project_history_with_limit(&database, &tenant, &project, Some(limit)).await?;
    let entries =
        enrich_history_components(&ctx.env, &database, &tenant, &project, entries).await?;
    Response::from_json(&HistoryResponse { entries })
}

pub(crate) async fn history_entry(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let entry_id = param(&ctx, "entry_id")?;
    let database = db(&ctx)?;
    let mut entry = features::get_history_entry(&database, &tenant, &project, &entry_id).await?;
    if let Some(entry) = &mut entry {
        check_workspace_read_capability(
            &database,
            &tenant,
            &project,
            user.as_deref(),
            &entry.workspace,
        )
        .await?;
        enrich_history_entry(&ctx.env, &tenant, &project, entry).await?;
        enrich_history_components_for_entry(&ctx.env, &database, &tenant, &project, entry).await?;
    }
    match entry {
        Some(e) => Response::from_json(&e),
        None => json_error(404, "history entry not found"),
    }
}

async fn finish_head_update_side_effects(
    env: &Env,
    database: &crate::request_context::Database,
    app: &crate::request_context::AppContext,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
    user: &str,
) -> Result<()> {
    let _ = features::warm_snapshot_caches_for_history(env, database, tenant, project, head).await;
    let queue = app.queue(crate::work_queue::WEBHOOK_QUEUE_BINDING).ok();
    crate::webhooks::dispatch_project_event(
        database,
        queue.as_ref(),
        tenant,
        project,
        "sync",
        serde_json::json!({ "workspace": workspace, "head": head, "actor": user }),
    )
    .await?;
    enqueue_ci_for_pushed_head(env, database, app, tenant, project, workspace, head).await?;
    if let Some(state) = features::workspace_state(database, tenant, project, workspace).await?
        && state.status == "ready"
    {
        let jobs = crate::routes::ci::materialize_ci_for_ready_head(
            env, database, tenant, project, workspace, head,
        )
        .await?;
        if !jobs.is_empty() {
            let queue = app.queue(crate::work_queue::WEBHOOK_QUEUE_BINDING).ok();
            crate::webhooks::dispatch_project_event(
                database,
                queue.as_ref(),
                tenant,
                project,
                "ci.jobs_queued",
                serde_json::json!({ "workspace": workspace, "head": head, "jobs": jobs }),
            )
            .await?;
            app.wait_until({
                let env = env.clone();
                let tenant = tenant.to_string();
                let project = project.to_string();
                let count = jobs.len();
                async move {
                    let _ =
                        crate::ci_runner_pool::notify_runners(&env, &tenant, &project, count)
                            .await;
                }
            });
        }
        let settings = features::project_settings(
            database,
            tenant,
            project,
            Some(&sty_protocol::TokenPrincipal {
                user: user.to_string(),
            }),
        )
        .await?;
        let merge_status = crate::routes::governance::workspace_merge_status(
            Some(env),
            database,
            tenant,
            project,
            workspace,
            Some(head),
            &settings,
        )
        .await?;
        features::set_workspace_mergeable(
            database,
            tenant,
            project,
            workspace,
            merge_status.can_merge,
        )
        .await?;
    }
    Ok(())
}

async fn enqueue_ci_for_pushed_head(
    env: &Env,
    database: &crate::request_context::Database,
    app: &crate::request_context::AppContext,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
) -> Result<()> {
    let settings = features::project_settings(database, tenant, project, None).await?;
    let changed_paths =
        ci_changed_paths_for_head(env, database, tenant, project, head).await?;
    let affected_components = changed_paths
        .as_ref()
        .map(|paths| features::component_ids_for_paths(&settings, paths));
    let jobs = features::enqueue_ci_jobs_for_head(
        database,
        tenant,
        project,
        workspace,
        head,
        &settings.ci,
        "workspace.push",
        changed_paths.as_deref(),
        affected_components.as_deref(),
    )
    .await?;
    if jobs.is_empty() {
        return Ok(());
    }
    features::record_audit_event(
        database,
        tenant,
        project,
        "system",
        "ci.jobs_queued",
        "workspace",
        workspace,
        serde_json::json!({
            "event": "workspace.push",
            "head": head,
            "jobs": jobs.iter().map(|job| job.id.clone()).collect::<Vec<_>>(),
            "affected_components": affected_components.unwrap_or_default(),
        }),
    )
    .await?;
    app.wait_until({
        let env = env.clone();
        let tenant = tenant.to_string();
        let project = project.to_string();
        let count = jobs.len();
        async move {
            let _ = crate::ci_runner_pool::notify_runners(&env, &tenant, &project, count).await;
        }
    });
    Ok(())
}

async fn enrich_history_components(
    env: &Env,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    mut entries: Vec<HistoryEntry>,
) -> Result<Vec<HistoryEntry>> {
    let settings = features::project_settings(database, tenant, project, None).await?;
    if settings.components.is_empty() {
        return Ok(entries);
    }
    for entry in &mut entries {
        enrich_history_components_with_settings(env, database, tenant, project, &settings, entry)
            .await?;
    }
    Ok(entries)
}

async fn enrich_history_components_for_entry(
    env: &Env,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    entry: &mut HistoryEntry,
) -> Result<()> {
    let settings = features::project_settings(database, tenant, project, None).await?;
    enrich_history_components_with_settings(env, database, tenant, project, &settings, entry).await
}

async fn enrich_history_components_with_settings(
    env: &Env,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    settings: &sty_protocol::ProjectSettings,
    entry: &mut HistoryEntry,
) -> Result<()> {
    let Some(snapshot_id) = entry.snapshot_id.as_deref() else {
        return Ok(());
    };
    let Some(changed_paths) =
        ci_changed_paths_for_head(env, database, tenant, project, snapshot_id).await?
    else {
        return Ok(());
    };
    entry.components = features::component_ids_for_paths(settings, &changed_paths);
    Ok(())
}

pub(crate) async fn ci_changed_paths_for_head(
    env: &Env,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    head: &str,
) -> Result<Option<Vec<String>>> {
    let Some(parent) = snapshot_parent(env, tenant, project, head).await? else {
        return Ok(None);
    };
    crate::routes::graph::changed_paths_with_cache(env, database, tenant, project, head, &parent)
        .await
        .map(Some)
}

pub(crate) async fn ci_changed_paths_for_workspace_head(
    env: &Env,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
) -> Result<Option<Vec<String>>> {
    let Some(state) = features::workspace_state(database, tenant, project, workspace).await? else {
        return Ok(None);
    };
    let parent_workspace = state.parent_workspace.as_deref().unwrap_or("main");
    let Some(parent) =
        features::workspace_state(database, tenant, project, parent_workspace).await?
    else {
        return Ok(None);
    };
    let Some(parent_head) = parent.head.as_deref() else {
        return Ok(None);
    };
    crate::routes::graph::changed_paths_with_cache(
        env,
        database,
        tenant,
        project,
        head,
        parent_head,
    )
    .await
    .map(Some)
}

pub(crate) async fn snapshot_parent(
    env: &Env,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
) -> Result<Option<String>> {
    let features = bucket(env)?;
    let bytes = match r2_bytes(&features, &object_key(tenant, project, snapshot_id)).await {
        Ok(bytes) => bytes,
        Err(_) => return Ok(None),
    };
    let snapshot: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|error| Error::RustError(error.to_string()))?;
    Ok(snapshot["parents"]
        .as_array()
        .and_then(|parents| parents.first())
        .and_then(|parent| parent.as_str())
        .map(ToOwned::to_owned))
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
    let features = bucket(env)?;
    let bytes = match r2_bytes(&features, &object_key(tenant, project, snapshot_id)).await {
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
) -> Result<features::HistorySnapshotMetadata> {
    let features = bucket(env)?;
    let bytes = r2_bytes(&features, &object_key(tenant, project, snapshot_id)).await?;
    let snapshot: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|error| Error::RustError(error.to_string()))?;
    Ok(history_metadata_from_snapshot(&snapshot))
}

fn history_metadata_from_snapshot(
    snapshot: &serde_json::Value,
) -> features::HistorySnapshotMetadata {
    features::HistorySnapshotMetadata {
        agent: snapshot["agent"].as_str().map(ToOwned::to_owned),
        model: snapshot["agent_model"].as_str().map(ToOwned::to_owned),
        signature: snapshot["signature"]
            .as_object()
            .map(|signature| HistorySignature {
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

pub(crate) async fn log_history(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let actor = user.clone();
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: LogHistoryRequest = req.json().await?;
    let database = db(&ctx)?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    if let Some(snapshot_id) = body.snapshot_id.as_deref() {
        validate_object_id(snapshot_id)?;
        match features::object_kind(&database, &tenant, &project, snapshot_id).await? {
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
    features::log_history(
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
    if let Some(snapshot_id) = body.snapshot_id.as_deref() {
        let app = ctx.data.clone();
        let env = ctx.env.clone();
        let tenant = tenant.to_string();
        let project = project.to_string();
        let snapshot_id = snapshot_id.to_string();
        ctx.data.wait_until(async move {
            let database = app.database();
            let _ = features::warm_snapshot_caches_for_history(
                &env,
                &database,
                &tenant,
                &project,
                &snapshot_id,
            )
            .await;
        });
    }
    emit_history_event(
        &ctx,
        &tenant,
        &project,
        &workspace,
        &body.kind,
        &body.message,
        body.snapshot_id.as_deref(),
        &actor,
    );
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn rewrite_history(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let actor = user.clone();
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: RewriteHistoryRequest = req.json().await?;
    let database = db(&ctx)?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    for snapshot_id in &body.old_snapshot_ids {
        validate_object_id(snapshot_id)?;
    }
    if let Some(snapshot_id) = body.snapshot_id.as_deref() {
        validate_object_id(snapshot_id)?;
        match features::object_kind(&database, &tenant, &project, snapshot_id).await? {
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
    features::rewrite_history(
        &database,
        &tenant,
        &project,
        &workspace,
        &sty_protocol::TokenPrincipal { user },
        &body.old_snapshot_ids,
        &body.kind,
        &body.message,
        body.snapshot_id.as_deref(),
        metadata.as_ref(),
    )
    .await?;
    features::record_audit_event(
        &database,
        &tenant,
        &project,
        &actor,
        "history.rewrite",
        "workspace",
        &workspace,
        serde_json::json!({
            "old_snapshot_ids": body.old_snapshot_ids.clone(),
            "snapshot_id": body.snapshot_id.clone(),
            "kind": body.kind.clone()
        }),
    )
    .await?;
    emit_history_event(
        &ctx,
        &tenant,
        &project,
        &workspace,
        &body.kind,
        &body.message,
        body.snapshot_id.as_deref(),
        &actor,
    );
    Response::from_json(&OkResponse { ok: true })
}

fn emit_history_event(
    ctx: &crate::request_context::AppRouteContext,
    tenant: &str,
    project: &str,
    workspace: &str,
    kind: &str,
    message: &str,
    snapshot_id: Option<&str>,
    actor: &str,
) {
    let event = match kind {
        "ship" => "snapshot.shipped",
        "pack" => "snapshot.packed",
        _ => "snapshot.saved",
    };
    let _ = crate::webhooks::emit_project_event(
        ctx,
        tenant,
        project,
        event,
        serde_json::json!({
            "workspace": workspace,
            "kind": kind,
            "message": message,
            "snapshot": snapshot_id,
            "actor": actor
        }),
    );
}

pub(crate) async fn mark_ready(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "contributor",
        "workspaces:ready",
    )
    .await?;
    let state = features::workspace_states(&database, &tenant, &project)
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
    features::mark_workspace_ready(
        &database,
        &tenant,
        &project,
        &workspace,
        &sty_protocol::TokenPrincipal { user: user.clone() },
    )
    .await?;
    let settings = features::project_settings(
        &database,
        &tenant,
        &project,
        Some(&sty_protocol::TokenPrincipal { user: user.clone() }),
    )
    .await?;
    crate::routes::ci::enqueue_ci_for_ready_head(
        &ctx,
        &tenant,
        &project,
        &workspace,
        state.head.as_deref(),
    )
    .await?;
    let merge_status = crate::routes::governance::workspace_merge_status(
        Some(&ctx.env),
        &database,
        &tenant,
        &project,
        &workspace,
        state.head.as_deref(),
        &settings,
    )
    .await?;
    features::set_workspace_mergeable(
        &database,
        &tenant,
        &project,
        &workspace,
        merge_status.can_merge,
    )
    .await?;
    features::record_audit_event(
        &database,
        &tenant,
        &project,
        &user,
        "workspace.ready",
        "workspace",
        &workspace,
        serde_json::json!({ "head": state.head.clone() }),
    )
    .await?;
    crate::routes::governance::notify_users(
        &database,
        state.reviewers.clone(),
        &user,
        &tenant,
        &project,
        "workspace.ready",
        &format!("{workspace} is ready"),
        "A workspace is ready for review.",
        &format!("/{tenant}/{project}/workspaces/{workspace}"),
    )
    .await?;
    let _ = crate::webhooks::emit_project_event(
        &ctx,
        &tenant,
        &project,
        "workspace.ready",
        serde_json::json!({ "workspace": workspace }),
    );
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn merge_workspace(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "workspaces:merge",
    )
    .await?;
    let states = features::workspace_states(&database, &tenant, &project).await?;
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
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    let settings =
        features::project_settings(&database, &tenant, &project, Some(&principal)).await?;
    if let Some(response) = crate::routes::governance::require_workspace_mergeable(
        Some(&ctx.env),
        &database,
        &tenant,
        &project,
        &workspace,
        Some(&workspace_head),
        &settings,
    )
    .await?
    {
        return Ok(response);
    }
    let parent = state
        .parent_workspace
        .as_deref()
        .unwrap_or("main")
        .to_string();
    let parent_head = features::head(&database, &tenant, &project, &parent).await?;
    let merge = create_workspace_merge_snapshot(
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
    if !merge.conflicts.is_empty() {
        features::upsert_workspace_check(
            &database,
            &tenant,
            &project,
            &workspace,
            Some(&workspace_head),
            "merge",
            "completed",
            Some("failure"),
            Some("Server merge found conflicts."),
            None,
        )
        .await?;
        return json_error(
            409,
            &format!(
                "workspace has merge conflicts: {}",
                merge
                    .conflicts
                    .iter()
                    .take(8)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        );
    }
    let merge_head = merge
        .snapshot_id
        .ok_or_else(|| Error::RustError("server merge did not produce a snapshot".to_string()))?;
    let updated = features::update_head(
        &database,
        &tenant,
        &project,
        &parent,
        parent_head.as_deref(),
        &merge_head,
        Some(&user),
    )
    .await?;
    if !updated {
        return json_error(409, "parent workspace head changed");
    }
    features::log_history(
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
    features::merge_workspace(
        &database,
        &tenant,
        &project,
        &workspace,
        &principal,
        &merge_head,
    )
    .await?;
    features::record_audit_event(
        &database,
        &tenant,
        &project,
        &user,
        "workspace.merge",
        "workspace",
        &workspace,
        serde_json::json!({ "parent": parent, "head": merge_head }),
    )
    .await?;
    crate::routes::governance::notify_users(
        &database,
        state
            .reviewers
            .iter()
            .chain(state.assignees.iter())
            .cloned()
            .collect::<Vec<_>>(),
        &user,
        &tenant,
        &project,
        "workspace.merged",
        &format!("{workspace} was merged"),
        "A workspace you follow was merged.",
        &format!("/{tenant}/{project}/workspaces/{workspace}"),
    )
    .await?;
    let _ = crate::webhooks::emit_project_event(
        &ctx,
        &tenant,
        &project,
        "workspace.merged",
        serde_json::json!({
            "workspace": workspace,
            "parent": parent,
            "head": merge_head,
            "auto_merged_files": merge.auto_merged_files
        }),
    );
    Response::from_json(&serde_json::json!({
        "ok": true,
        "parent_workspace": parent,
        "head": merge_head,
    }))
}

pub(crate) async fn update_workspace_labels(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
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
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    if !features::workspace_exists(&database, &tenant, &project, &workspace).await? {
        return json_error(404, "workspace not found");
    }
    features::set_workspace_labels(&database, &tenant, &project, &workspace, &labels).await?;
    Response::from_json(&serde_json::json!({ "labels": labels }))
}

pub(crate) async fn close_workspace(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await.unwrap_or_default();
    let status = match body["status"].as_str().unwrap_or("closed") {
        "not_planned" => "not_planned",
        _ => "closed",
    };
    let reason = body["reason"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "workspaces:write",
    )
    .await?;
    let state = features::workspace_states(&database, &tenant, &project)
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
    features::close_workspace(
        &database,
        &tenant,
        &project,
        &workspace,
        status,
        &sty_protocol::TokenPrincipal { user },
        reason,
    )
    .await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn reopen_workspace(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await.unwrap_or_default();
    let reason = body["reason"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "workspaces:write",
    )
    .await?;
    let state = features::workspace_states(&database, &tenant, &project)
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
    features::reopen_workspace(
        &database,
        &tenant,
        &project,
        &workspace,
        &sty_protocol::TokenPrincipal { user },
        reason,
    )
    .await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn delete_draft_workspace(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    let state = features::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace);
    let Some(state) = state else {
        return json_error(404, "workspace not found");
    };
    if workspace == "main" || state.is_ready || !matches!(state.status.as_str(), "active" | "draft")
    {
        return json_error(409, "only draft workspaces can be deleted");
    }
    features::delete_draft_workspace(
        &database,
        &tenant,
        &project,
        &workspace,
        &sty_protocol::TokenPrincipal { user },
    )
    .await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn merge_preview(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_workspace_read_capability(&database, &tenant, &project, user.as_deref(), &workspace)
        .await?;
    let states = features::workspace_states(&database, &tenant, &project).await?;
    let ws = states
        .into_iter()
        .find(|s| s.name == workspace)
        .ok_or_else(|| Error::RustError("workspace not found".to_string()))?;
    let parent = ws.parent_workspace.as_deref().unwrap_or("main");
    let head = features::head(&database, &tenant, &project, &workspace).await?;
    let parent_head = features::head(&database, &tenant, &project, parent).await?;
    let mut files = Vec::new();
    match (head.as_deref(), parent_head.as_deref()) {
        (Some(current), Some(base)) => {
            let changed_paths = crate::routes::graph::changed_paths_with_cache(
                &ctx.env,
                &database,
                &tenant,
                &project,
                current,
                base,
            )
            .await?;
            let current_map = features::cached_snapshot_blob_map(
                &ctx.env,
                &database,
                &tenant,
                &project,
                current,
            )
            .await?;
            let parent_map = features::cached_snapshot_blob_map(
                &ctx.env,
                &database,
                &tenant,
                &project,
                base,
            )
            .await?;
            for path in changed_paths {
                match (current_map.get(&path), parent_map.get(&path)) {
                    (Some(new_id), None) => files.push(sty_protocol::ChangedFile {
                        path: path.clone(),
                        change_type: "added".to_string(),
                        old_id: None,
                        new_id: Some(new_id.clone()),
                    }),
                    (Some(new_id), Some(old_id)) if new_id != old_id => {
                        files.push(sty_protocol::ChangedFile {
                            path: path.clone(),
                            change_type: "modified".to_string(),
                            old_id: Some(old_id.clone()),
                            new_id: Some(new_id.clone()),
                        });
                    }
                    (None, Some(old_id)) => files.push(sty_protocol::ChangedFile {
                        path: path.clone(),
                        change_type: "deleted".to_string(),
                        old_id: Some(old_id.clone()),
                        new_id: None,
                    }),
                    _ => {}
                }
            }
        }
        (Some(current), None) => {
            let current_map = features::cached_snapshot_blob_map(
                &ctx.env,
                &database,
                &tenant,
                &project,
                current,
            )
            .await?;
            for (path, id) in current_map {
                files.push(sty_protocol::ChangedFile {
                    path,
                    change_type: "added".to_string(),
                    old_id: None,
                    new_id: Some(id),
                });
            }
        }
        _ => {}
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Response::from_json(&sty_protocol::MergePreviewResponse { files })
}

pub(crate) async fn set_parent(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await?;
    let database = db(&ctx)?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    let parent = body["parent_workspace"].as_str();
    features::set_parent_workspace(&database, &tenant, &project, &workspace, parent).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn compare(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: CompareRequest = req.json().await?;
    let database = db(&ctx)?;
    check_workspace_read_capability(&database, &tenant, &project, Some(&user), &workspace).await?;
    let state = features::workspace_state(&database, &tenant, &project, &workspace).await?;
    if let Some(state) = state.as_ref()
        && state.status == "merged"
    {
        let parent_workspace = state
            .parent_workspace
            .clone()
            .unwrap_or_else(|| "main".to_string());
        let parent_head = features::head(&database, &tenant, &project, &parent_workspace).await?;
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
        let parent_head = features::head(&database, &tenant, &project, &parent_workspace).await?;
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
        .or(features::head(&database, &tenant, &project, &workspace).await?);
    let relation = compare_relation(
        &ctx.env,
        &tenant,
        &project,
        body.local_head.as_deref(),
        remote_head.as_deref(),
    )
    .await?;
    Response::from_json(&CompareResponse {
        remote_head,
        relation,
        workspace_status: None,
        parent_workspace: None,
        parent_head: None,
    })
}

async fn ensure_snapshot_refs_uploaded(
    env: &Env,
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    snapshot_id: &str,
    expected_head: Option<&str>,
    objects_verified: bool,
) -> Result<()> {
    let current_head = features::head(db, tenant, project, workspace).await?;
    let features = bucket(env)?;
    let snapshot_bytes = r2_bytes(&features, &object_key(tenant, project, snapshot_id)).await?;
    validate_snapshot_signature(db, &snapshot_bytes)
        .await
        .map_err(|reason| Error::RustError(format!("invalid snapshot signature: {reason}")))?;
    let snapshot: serde_json::Value =
        serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
    let root_tree = snapshot["root_tree"]
        .as_str()
        .ok_or_else(|| Error::RustError("snapshot root_tree is missing".to_string()))?;
    validate_object_id(root_tree)?;
    expect_uploaded_object_kind(
        env,
        db,
        tenant,
        project,
        root_tree,
        "tree",
        objects_verified,
        "snapshot root_tree is missing",
        "snapshot root_tree is not a tree",
    )
    .await?;
    if !objects_verified {
        validate_tree_closure(&features, db, tenant, project, root_tree).await?;
    }
    let parents = snapshot["parents"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if objects_verified {
        for parent in parents {
            let parent_id = parent
                .as_str()
                .ok_or_else(|| Error::RustError("snapshot parent is invalid".to_string()))?;
            validate_object_id(parent_id)?;
            if expected_head == Some(parent_id) || current_head.as_deref() == Some(parent_id) {
                continue;
            }
            expect_uploaded_object_kind(
                env,
                db,
                tenant,
                project,
                parent_id,
                "snapshot",
                true,
                "snapshot parent is missing",
                "snapshot parent is not a snapshot",
            )
            .await?;
        }
    } else {
        for parent in parents {
            let parent_id = parent
                .as_str()
                .ok_or_else(|| Error::RustError("snapshot parent is invalid".to_string()))?;
            validate_object_id(parent_id)?;
            expect_uploaded_object_kind(
                env,
                db,
                tenant,
                project,
                parent_id,
                "snapshot",
                false,
                "snapshot parent is missing",
                "snapshot parent is not a snapshot",
            )
            .await?;
        }
    }
    Ok(())
}

async fn expect_uploaded_object_kind(
    env: &Env,
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    id: &str,
    expected: &str,
    objects_verified: bool,
    missing_message: &str,
    mismatch_message: &str,
) -> Result<()> {
    let kind = if objects_verified {
        features::object_kind_resolved(env, db, tenant, project, id).await?
    } else {
        features::object_kind(db, tenant, project, id).await?
    };
    match kind.as_deref() {
        Some(kind) if kind == expected => Ok(()),
        Some(_) => Err(Error::RustError(mismatch_message.to_string())),
        None => Err(Error::RustError(missing_message.to_string())),
    }
}
