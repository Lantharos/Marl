pub(crate) async fn project_overview(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let principal = sty_protocol::TokenPrincipal { user };
    let project_summary = d1::get_project(&database, &tenant, &project)
        .await?
        .ok_or_else(|| Error::RustError("project not found".to_string()))?;
    let workspaces = d1::workspace_states(&database, &tenant, &project).await?;
    let settings = d1::project_settings(&database, &tenant, &project, &principal).await?;
    let stats = d1::project_stats(&database, &tenant, &project).await?;
    let default_workspace = settings.default_workspace.clone();
    let default_head = d1::head(&database, &tenant, &project, &default_workspace).await?;
    let etag = overview_etag(
        &project_summary,
        &workspaces,
        &settings,
        &stats,
        default_head.as_deref(),
    )?;
    if let Some(response) = not_modified_response(&req, &etag, false, 15, false)? {
        return Ok(response);
    }
    let history = d1::project_history_with_limit(&database, &tenant, &project, Some(20)).await?;
    let readme =
        project_readme_text(&ctx.env, &database, &tenant, &project, &default_workspace).await?;
    let recent_activity = history
        .into_iter()
        .take(20)
        .map(|entry| {
            json!({
                "id": entry.id,
                "kind": entry.kind,
                "actor": entry.author,
                "actor_profile": entry.author_profile,
                "message": entry.message,
                "timestamp": entry.timestamp,
                "workspace": entry.workspace,
            })
        })
        .collect::<Vec<_>>();
    let mut response = Response::from_json(&json!({
        "project": project_summary,
        "workspaces": workspaces,
        "settings": settings,
        "readme": readme,
        "stats": stats,
        "recent_activity": recent_activity,
        "default_workspace": default_workspace,
    }))?;
    apply_cache_headers(response.headers_mut(), &etag, false, 15, false)?;
    Ok(response)
}

pub(crate) async fn project_stats(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let stats = d1::project_stats(&database, &tenant, &project).await?;
    let etag = format!(
        "stats-{}-{}-{}-{}-{}",
        stats.workspace_count,
        stats.open_issue_count,
        stats.ready_count,
        stats.release_count,
        stats.history_count
    );
    let public_cache = matches!(
        d1::project_visibility(&database, &tenant, &project).await?,
        Some(visibility) if visibility == "public"
    );
    if let Some(response) = not_modified_response(&req, &etag, public_cache, 15, false)? {
        return Ok(response);
    }
    let mut response = Response::from_json(&stats)?;
    apply_cache_headers(response.headers_mut(), &etag, public_cache, 15, false)?;
    Ok(response)
}

async fn project_readme_text(
    env: &Env,
    db: &D1Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<Option<String>> {
    let Some(head_id) = d1::head(db, tenant, project, workspace).await? else {
        return Ok(None);
    };
    let store = bucket(env)?;
    let snapshot_bytes = r2_bytes(&store, &object_key(tenant, project, &head_id)).await?;
    let snapshot: serde_json::Value =
        serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
    let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
    for path in ["README.md", "Readme.md", "readme.md"] {
        let Some(entry) = resolve_tree_path(&store, tenant, project, &root_tree, path).await? else {
            continue;
        };
        if entry.entry_type != "blob" {
            continue;
        }
        let bytes = r2_bytes(&store, &object_key(tenant, project, &entry.id)).await?;
        if let Ok(text) = String::from_utf8(bytes) {
            return Ok(Some(text));
        }
    }
    Ok(None)
}

fn overview_etag(
    project: &ProjectSummary,
    workspaces: &[sty_protocol::WorkspaceState],
    settings: &sty_protocol::ProjectSettings,
    stats: &sty_protocol::ProjectStats,
    default_head: Option<&str>,
) -> Result<String> {
    let body = serde_json::to_vec(&json!({
        "project": project,
        "workspaces": workspaces,
        "settings": settings,
        "stats": stats,
        "default_head": default_head,
    }))
    .map_err(|error| Error::RustError(error.to_string()))?;
    Ok(format!("overview-{}", hex::encode(Sha256::digest(body))))
}
