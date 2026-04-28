pub(crate) async fn project_tree(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let workspace = req.url()?.query_pairs().find_map(|(k, v)| {
        (k == "workspace").then(|| v.to_string())
    }).unwrap_or_else(|| "main".to_string());
    let snapshot_param = req.url()?.query_pairs().find_map(|(k, v)| {
        (k == "snapshot").then(|| v.to_string())
    });
    let head_id = if let Some(snapshot) = snapshot_param {
        snapshot
    } else {
        let head = d1::head(&database, &tenant, &project, &workspace).await?;
        match head {
            Some(h) => h,
            None => {
                return Response::from_json(&ProjectTreeResponse {
                    workspace: workspace.clone(),
                    head: None,
                    root_tree: None,
                    entries: Vec::new(),
                });
            }
        }
    };
    let store = bucket(&ctx.env)?;
    let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &head_id)).await?;
    let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
    let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
    let mut entries = Vec::new();
    walk_tree(&store, &tenant, &project, "", &root_tree, &mut entries).await?;
    Response::from_json(&ProjectTreeResponse {
        workspace: workspace.clone(),
        head: Some(head_id.clone()),
        root_tree: Some(root_tree),
        entries,
    })
}

pub(crate) async fn project_file(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let path = param(&ctx, "path")?;
    let workspace = req.url()?.query_pairs().find_map(|(k, v)| {
        (k == "workspace").then(|| v.to_string())
    }).unwrap_or_else(|| "main".to_string());
    let snapshot_param = req.url()?.query_pairs().find_map(|(k, v)| {
        (k == "snapshot").then(|| v.to_string())
    });
    let head_id = if let Some(snapshot) = snapshot_param {
        snapshot
    } else {
        let head = d1::head(&database, &tenant, &project, &workspace).await?;
        match head {
            Some(h) => h,
            None => return json_error(404, "workspace has no head"),
        }
    };
    let store = bucket(&ctx.env)?;
    let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &head_id)).await?;
    let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
    let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
    let Some(entry) = resolve_tree_path(&store, &tenant, &project, &root_tree, &path).await? else {
        return json_error(404, "file not found");
    };
    if entry.entry_type != "blob" {
        return json_error(400, "path is not a file");
    }
    let bytes = r2_bytes(&store, &object_key(&tenant, &project, &entry.id)).await?;
    let text = String::from_utf8(bytes).ok();
    Response::from_json(&ObjectFileResponse {
        path: path.clone(),
        id: entry.id.clone(),
        binary: text.is_none(),
        text,
    })
}
