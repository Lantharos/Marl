struct ServerMergeSnapshot {
    snapshot_id: Option<String>,
    conflicts: Vec<String>,
    auto_merged_files: usize,
}

#[derive(Clone)]
struct ServerSnapshotPayload {
    parents: Vec<String>,
    root_tree: String,
    message: Option<String>,
    intents: Vec<serde_json::Value>,
}

struct ServerMergeAccumulator {
    files: std::collections::BTreeMap<String, String>,
    conflicts: Vec<String>,
    auto_merged_files: usize,
}

#[derive(serde::Serialize)]
struct ServerTreeObject {
    entries: Vec<ServerTreeEntry>,
}

#[derive(Clone, serde::Serialize)]
struct ServerTreeEntry {
    name: String,
    id: String,
    entry_type: String,
}

async fn create_workspace_merge_snapshot(
    env: &Env,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    parent: &str,
    workspace_head: &str,
    parent_head: Option<&str>,
    actor: &str,
) -> Result<ServerMergeSnapshot> {
    validate_snapshot_object(database, tenant, project, workspace_head, "workspace head").await?;
    if let Some(parent_head) = parent_head {
        validate_snapshot_object(database, tenant, project, parent_head, "parent head").await?;
    }

    let store = bucket(env)?;
    let workspace_snapshot = read_server_snapshot(&store, tenant, project, workspace_head).await?;
    validate_tree_closure(&store, database, tenant, project, &workspace_snapshot.root_tree).await?;
    let parent_snapshot = match parent_head {
        Some(id) => Some(read_server_snapshot(&store, tenant, project, id).await?),
        None => None,
    };
    if let Some(parent_snapshot) = parent_snapshot.as_ref() {
        validate_tree_closure(&store, database, tenant, project, &parent_snapshot.root_tree).await?;
    }

    let base_snapshot_id = match parent_head {
        Some(parent_head) => common_snapshot_ancestor(env, tenant, project, parent_head, workspace_head).await?,
        None => None,
    };
    if parent_head.is_some() && base_snapshot_id.is_none() {
        return Ok(ServerMergeSnapshot {
            snapshot_id: None,
            conflicts: vec!["no common merge base".to_string()],
            auto_merged_files: 0,
        });
    }

    let base_files = match base_snapshot_id.as_deref() {
        Some(id) => {
            let snapshot = read_server_snapshot(&store, tenant, project, id).await?;
            server_snapshot_blob_map(&store, tenant, project, &snapshot.root_tree).await?
        }
        None => std::collections::BTreeMap::new(),
    };
    let parent_files = match parent_snapshot.as_ref() {
        Some(snapshot) => {
            server_snapshot_blob_map(&store, tenant, project, &snapshot.root_tree).await?
        }
        None => std::collections::BTreeMap::new(),
    };
    let workspace_files =
        server_snapshot_blob_map(&store, tenant, project, &workspace_snapshot.root_tree).await?;
    let merge = merge_blob_maps(&base_files, &parent_files, &workspace_files);
    if !merge.conflicts.is_empty() {
        return Ok(ServerMergeSnapshot {
            snapshot_id: None,
            conflicts: merge.conflicts,
            auto_merged_files: merge.auto_merged_files,
        });
    }

    let root_tree = write_tree_map(&store, database, tenant, project, &merge.files).await?;
    validate_tree_closure(&store, database, tenant, project, &root_tree).await?;
    let message = workspace_snapshot
        .message
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("merge {workspace}: {value}"))
        .unwrap_or_else(|| format!("merge workspace {workspace} into {parent}"));
    let parents = parent_head
        .into_iter()
        .chain(std::iter::once(workspace_head))
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    let snapshot_id = write_server_merge_snapshot(
        &store,
        database,
        tenant,
        project,
        parent,
        actor,
        parents,
        root_tree,
        message,
        workspace_snapshot.intents,
    )
    .await?;

    Ok(ServerMergeSnapshot {
        snapshot_id: Some(snapshot_id),
        conflicts: Vec::new(),
        auto_merged_files: merge.auto_merged_files,
    })
}

async fn validate_snapshot_object(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
    label: &str,
) -> Result<()> {
    validate_object_id(snapshot_id)?;
    match d1::object_kind(database, tenant, project, snapshot_id).await? {
        Some(kind) if kind == "snapshot" => Ok(()),
        Some(_) => Err(Error::RustError(format!("{label} is not a snapshot"))),
        None => Err(Error::RustError(format!("{label} is missing"))),
    }
}

async fn read_server_snapshot(
    store: &Bucket,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
) -> Result<ServerSnapshotPayload> {
    let bytes = r2_bytes(store, &object_key(tenant, project, snapshot_id)).await?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|error| Error::RustError(error.to_string()))?;
    let root_tree = value["root_tree"]
        .as_str()
        .ok_or_else(|| Error::RustError("snapshot root_tree is missing".to_string()))?
        .to_string();
    validate_object_id(&root_tree)?;
    let parents = value["parents"]
        .as_array()
        .ok_or_else(|| Error::RustError("snapshot parents are missing".to_string()))?
        .iter()
        .map(|parent| {
            let id = parent
                .as_str()
                .ok_or_else(|| Error::RustError("snapshot parent is invalid".to_string()))?;
            validate_object_id(id)?;
            Ok(id.to_string())
        })
        .collect::<Result<Vec<_>>>()?;
    let message = value["message"].as_str().map(ToOwned::to_owned);
    let intents = value["intents"].as_array().cloned().unwrap_or_default();
    Ok(ServerSnapshotPayload {
        parents,
        root_tree,
        message,
        intents,
    })
}

async fn common_snapshot_ancestor(
    env: &Env,
    tenant: &str,
    project: &str,
    left: &str,
    right: &str,
) -> Result<Option<String>> {
    let left_ancestors = snapshot_ancestor_set(env, tenant, project, left).await?;
    let store = bucket(env)?;
    let mut seen = std::collections::BTreeSet::new();
    let mut stack = vec![right.to_string()];
    while let Some(id) = stack.pop() {
        if left_ancestors.contains(&id) {
            return Ok(Some(id));
        }
        if !seen.insert(id.clone()) {
            continue;
        }
        let snapshot = read_server_snapshot(&store, tenant, project, &id).await?;
        stack.extend(snapshot.parents);
    }
    Ok(None)
}

async fn snapshot_ancestor_set(
    env: &Env,
    tenant: &str,
    project: &str,
    head: &str,
) -> Result<std::collections::BTreeSet<String>> {
    let mut ancestors = std::collections::BTreeSet::new();
    let mut stack = vec![head.to_string()];
    let store = bucket(env)?;
    while let Some(id) = stack.pop() {
        if !ancestors.insert(id.clone()) {
            continue;
        }
        let snapshot = read_server_snapshot(&store, tenant, project, &id).await?;
        stack.extend(snapshot.parents);
    }
    Ok(ancestors)
}

async fn server_snapshot_blob_map(
    store: &Bucket,
    tenant: &str,
    project: &str,
    root_tree: &str,
) -> Result<std::collections::BTreeMap<String, String>> {
    let mut files = std::collections::BTreeMap::new();
    let mut stack = vec![(String::new(), root_tree.to_string(), 0usize)];
    while let Some((prefix, tree_id, depth)) = stack.pop() {
        if depth > MAX_TREE_DEPTH {
            return Err(Error::RustError("tree depth limit exceeded".to_string()));
        }
        let bytes = r2_bytes(store, &object_key(tenant, project, &tree_id)).await?;
        for entry in parse_tree_entries(&bytes)? {
            let path = if prefix.is_empty() {
                entry.name.clone()
            } else {
                format!("{prefix}/{}", entry.name)
            };
            match entry.entry_type.as_str() {
                "blob" => {
                    files.insert(path, entry.id);
                }
                "tree" => stack.push((path, entry.id, depth + 1)),
                _ => return Err(Error::RustError("unknown tree entry type".to_string())),
            }
            if files.len() > MAX_TREE_ENTRIES {
                return Err(Error::RustError("tree entry limit exceeded".to_string()));
            }
        }
    }
    Ok(files)
}

fn merge_blob_maps(
    base: &std::collections::BTreeMap<String, String>,
    parent: &std::collections::BTreeMap<String, String>,
    incoming: &std::collections::BTreeMap<String, String>,
) -> ServerMergeAccumulator {
    let all_paths = base
        .keys()
        .chain(parent.keys())
        .chain(incoming.keys())
        .cloned()
        .collect::<std::collections::BTreeSet<_>>();
    let mut files = std::collections::BTreeMap::new();
    let mut conflicts = Vec::new();
    let mut auto_merged_files = 0;

    for path in all_paths {
        let base_value = base.get(&path);
        let parent_value = parent.get(&path);
        let incoming_value = incoming.get(&path);

        if parent_value == incoming_value {
            if let Some(id) = parent_value {
                files.insert(path, id.clone());
            }
            continue;
        }
        if parent_value == base_value {
            if let Some(id) = incoming_value {
                files.insert(path, id.clone());
            }
            auto_merged_files += 1;
            continue;
        }
        if incoming_value == base_value {
            if let Some(id) = parent_value {
                files.insert(path, id.clone());
            }
            auto_merged_files += 1;
            continue;
        }
        conflicts.push(path);
    }

    ServerMergeAccumulator {
        files,
        conflicts,
        auto_merged_files,
    }
}

async fn write_tree_map(
    store: &Bucket,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    files: &std::collections::BTreeMap<String, String>,
) -> Result<String> {
    let mut file_entries = std::collections::BTreeMap::<String, Vec<ServerTreeEntry>>::new();
    let mut dirs = std::collections::BTreeSet::from([String::new()]);

    for (path, id) in files {
        let parts = path.split('/').collect::<Vec<_>>();
        if parts.is_empty() {
            return Err(Error::RustError("empty tree path".to_string()));
        }
        for part in &parts {
            validate_tree_entry_name(part)?;
        }
        let file_name = parts
            .last()
            .ok_or_else(|| Error::RustError("empty tree path".to_string()))?
            .to_string();
        let parent = parts[..parts.len().saturating_sub(1)].join("/");
        file_entries
            .entry(parent.clone())
            .or_default()
            .push(ServerTreeEntry {
                name: file_name,
                id: id.clone(),
                entry_type: "blob".to_string(),
            });
        for index in 0..parts.len().saturating_sub(1) {
            dirs.insert(parts[..=index].join("/"));
        }
    }

    let mut ordered_dirs = dirs.into_iter().collect::<Vec<_>>();
    ordered_dirs.sort_by_key(|path| std::cmp::Reverse(tree_path_depth(path)));
    let mut tree_ids = std::collections::BTreeMap::<String, String>::new();
    for dir in ordered_dirs {
        let mut entries = file_entries.remove(&dir).unwrap_or_default();
        let child_prefix = if dir.is_empty() {
            String::new()
        } else {
            format!("{dir}/")
        };
        for (path, id) in &tree_ids {
            if path.is_empty() || !path.starts_with(&child_prefix) {
                continue;
            }
            let rest = &path[child_prefix.len()..];
            if rest.is_empty() || rest.contains('/') {
                continue;
            }
            entries.push(ServerTreeEntry {
                name: rest.to_string(),
                id: id.clone(),
                entry_type: "tree".to_string(),
            });
        }
        entries.sort_by(|left, right| left.name.cmp(&right.name));
        let bytes = serde_json::to_vec(&ServerTreeObject { entries })
            .map_err(|error| Error::RustError(error.to_string()))?;
        let id = object_digest_for_kind(&bytes, "tree")?;
        put_bytes(store, &object_key(tenant, project, &id), bytes.clone()).await?;
        d1::record_object(database, tenant, project, &id, "tree", bytes.len()).await?;
        tree_ids.insert(dir, id);
    }

    tree_ids
        .remove("")
        .ok_or_else(|| Error::RustError("failed to write root tree".to_string()))
}

fn tree_path_depth(path: &str) -> usize {
    if path.is_empty() {
        0
    } else {
        path.split('/').count()
    }
}

async fn write_server_merge_snapshot(
    store: &Bucket,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    actor: &str,
    parents: Vec<String>,
    root_tree: String,
    message: String,
    intents: Vec<serde_json::Value>,
) -> Result<String> {
    let time: String = js_sys::Date::new_0().to_iso_string().into();
    let mut snapshot = serde_json::json!({
        "id": "",
        "parents": parents,
        "kind": "merge",
        "author": actor,
        "agent": null,
        "agent_model": null,
        "time": time,
        "message": message,
        "root_tree": root_tree,
        "workspace_id": workspace,
        "intents": intents,
    });
    let canonical_bytes =
        serde_json::to_vec(&snapshot).map_err(|error| Error::RustError(error.to_string()))?;
    let snapshot_id = object_digest_for_kind(&canonical_bytes, "snapshot")?;
    snapshot["id"] = serde_json::json!(snapshot_id);
    let bytes = serde_json::to_vec(&snapshot).map_err(|error| Error::RustError(error.to_string()))?;
    put_bytes(store, &object_key(tenant, project, &snapshot_id), bytes.clone()).await?;
    d1::record_object(database, tenant, project, &snapshot_id, "snapshot", bytes.len()).await?;
    Ok(snapshot_id)
}
