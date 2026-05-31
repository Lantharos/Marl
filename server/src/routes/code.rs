use super::prelude::*;
pub(crate) async fn project_tree(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    let url = req.url()?;
    let tree_prefix = url
        .query_pairs()
        .find_map(|(k, v)| ((k == "path") || (k == "prefix")).then(|| v.to_string()))
        .unwrap_or_default();
    let tree_prefix = normalize_tree_prefix(&tree_prefix)?;
    let tree_depth = crate::support::query_usize(&url, "depth")
        .unwrap_or(MAX_TREE_DEPTH)
        .min(MAX_TREE_DEPTH);
    let tree_limit = crate::support::query_usize(&url, "limit")
        .unwrap_or(5_000)
        .clamp(1, 10_000);
    let tree_cursor = url
        .query_pairs()
        .find_map(|(k, v)| (k == "cursor").then(|| v.to_string()))
        .map(|cursor| normalize_tree_prefix(&cursor))
        .transpose()?
        .filter(|cursor| !cursor.is_empty());
    let workspace = url
        .query_pairs()
        .find_map(|(k, v)| (k == "workspace").then(|| v.to_string()))
        .unwrap_or_else(|| "main".to_string());
    check_workspace_read_capability(&database, &tenant, &project, user.as_deref(), &workspace)
        .await?;
    let path_policy =
        features::path_visibility_policy(&database, &tenant, &project, user.as_deref()).await?;
    if !tree_prefix.is_empty() && !features::path_can_read(&path_policy, &tree_prefix) {
        return json_error(404, "path not found");
    }
    let snapshot_param = url
        .query_pairs()
        .find_map(|(k, v)| (k == "snapshot").then(|| v.to_string()));
    let pinned_snapshot = snapshot_param.is_some();
    let head_id = if let Some(snapshot) = snapshot_param {
        snapshot
    } else {
        let head = features::head(&database, &tenant, &project, &workspace).await?;
        match head {
            Some(h) => h,
            None => {
                return Response::from_json(&ProjectTreeResponse {
                    workspace: workspace.clone(),
                    head: None,
                    root_tree: None,
                    entries: Vec::new(),
                    prefix: (!tree_prefix.is_empty()).then_some(tree_prefix.clone()),
                    next_cursor: None,
                    truncated: false,
                });
            }
        }
    };
    let public_cache =
        features::workspace_is_publicly_readable(&database, &tenant, &project, &workspace).await?
            && !features::path_policy_restricts_objects(&path_policy);
    validate_object_id(&head_id)?;
    let cache_seconds = if pinned_snapshot { 31_536_000 } else { 60 };
    let tree_etag = tree_cache_etag(
        &head_id,
        &tree_prefix,
        tree_depth,
        tree_limit,
        tree_cursor.as_deref(),
    );
    if let Some(response) = not_modified_response(
        &req,
        &tree_etag,
        public_cache,
        cache_seconds,
        pinned_snapshot,
    )? {
        return Ok(response);
    }
    let features = bucket(&ctx.env)?;
    let snapshot_bytes = r2_bytes(&features, &object_key(&tenant, &project, &head_id)).await?;
    let snapshot: serde_json::Value =
        serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
    let root_tree = snapshot["root_tree"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let page = walk_tree_page(
        &features,
        &tenant,
        &project,
        &root_tree,
        TreeWalkOptions {
            prefix: tree_prefix.clone(),
            max_depth: tree_depth,
            limit: tree_limit,
            cursor: tree_cursor,
        },
    )
    .await?;
    let entries = page
        .entries
        .into_iter()
        .filter(|entry| features::path_can_read(&path_policy, &entry.path))
        .collect();
    let mut response = Response::from_json(&ProjectTreeResponse {
        workspace: workspace.clone(),
        head: Some(head_id.clone()),
        root_tree: Some(root_tree),
        entries,
        prefix: (!tree_prefix.is_empty()).then_some(tree_prefix),
        next_cursor: page.next_cursor,
        truncated: page.truncated,
    })?;
    apply_cache_headers(
        response.headers_mut(),
        &tree_etag,
        public_cache,
        cache_seconds,
        pinned_snapshot,
    )?;
    Ok(response)
}

fn tree_cache_etag(
    head_id: &str,
    prefix: &str,
    depth: usize,
    limit: usize,
    cursor: Option<&str>,
) -> String {
    let shape = format!("{prefix}\n{depth}\n{limit}\n{}", cursor.unwrap_or_default());
    let digest = hex::encode(Sha256::digest(shape.as_bytes()));
    format!("{head_id}-{digest}")
}

pub(crate) async fn project_file(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    let url = req.url()?;
    let path = param(&ctx, "path")
        .ok()
        .or_else(|| {
            url.query_pairs()
                .find_map(|(key, value)| (key == "path").then(|| value.to_string()))
        })
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| Error::RustError("path is required".to_string()))?;
    let path = normalize_tree_prefix(&path)?;
    let workspace = url
        .query_pairs()
        .find_map(|(k, v)| (k == "workspace").then(|| v.to_string()))
        .unwrap_or_else(|| "main".to_string());
    check_workspace_read_capability(&database, &tenant, &project, user.as_deref(), &workspace)
        .await?;
    let path_policy =
        features::path_visibility_policy(&database, &tenant, &project, user.as_deref()).await?;
    if !features::path_can_read(&path_policy, &path) {
        return json_error(404, "file not found");
    }
    let snapshot_param = url
        .query_pairs()
        .find_map(|(k, v)| (k == "snapshot").then(|| v.to_string()));
    let pinned_snapshot = snapshot_param.is_some();
    let head_id = if let Some(snapshot) = snapshot_param {
        snapshot
    } else {
        let head = features::head(&database, &tenant, &project, &workspace).await?;
        match head {
            Some(h) => h,
            None => return json_error(404, "workspace has no head"),
        }
    };
    let features = bucket(&ctx.env)?;
    validate_object_id(&head_id)?;
    let snapshot_bytes = r2_bytes(&features, &object_key(&tenant, &project, &head_id)).await?;
    let snapshot: serde_json::Value =
        serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
    let root_tree = snapshot["root_tree"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let Some(entry) = resolve_tree_path(&features, &tenant, &project, &root_tree, &path).await?
    else {
        return json_error(404, "file not found");
    };
    if entry.entry_type != "blob" {
        return json_error(400, "path is not a file");
    }
    let public_cache =
        features::workspace_is_publicly_readable(&database, &tenant, &project, &workspace).await?
            && !features::path_policy_restricts_objects(&path_policy);
    let cache_seconds = if pinned_snapshot { 31_536_000 } else { 60 };
    if let Some(response) = not_modified_response(
        &req,
        &entry.id,
        public_cache,
        cache_seconds,
        pinned_snapshot,
    )? {
        return Ok(response);
    }
    let bytes = r2_bytes(&features, &object_key(&tenant, &project, &entry.id)).await?;
    let text = String::from_utf8(bytes).ok();
    let mut response = Response::from_json(&ObjectFileResponse {
        path: path.clone(),
        id: entry.id.clone(),
        binary: text.is_none(),
        text,
    })?;
    apply_cache_headers(
        response.headers_mut(),
        &entry.id,
        public_cache,
        cache_seconds,
        pinned_snapshot,
    )?;
    Ok(response)
}
