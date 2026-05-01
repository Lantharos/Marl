use std::collections::BTreeSet;

pub(crate) async fn compare_relation(
    env: &Env,
    tenant: &str,
    project: &str,
    local_head: Option<&str>,
    remote_head: Option<&str>,
) -> Result<String> {
    let relation = match (local_head, remote_head) {
        (_, None) => "remote_missing",
        (Some(local), Some(remote)) if local == remote => "same",
        (None, Some(_)) => "remote_ahead",
        (Some(local), Some(remote)) if is_ancestor(env, tenant, project, remote, local).await? => "local_ahead",
        (Some(local), Some(remote)) if is_ancestor(env, tenant, project, local, remote).await? => "remote_ahead",
        _ => "diverged",
    };
    Ok(relation.to_string())
}

pub(crate) async fn is_ancestor(env: &Env, tenant: &str, project: &str, ancestor: &str, head: &str) -> Result<bool> {
    let mut seen = Vec::new();
    let mut stack = vec![head.to_string()];
    let store = bucket(env)?;
    while let Some(id) = stack.pop() {
        if id == ancestor {
            return Ok(true);
        }
        if seen.contains(&id) {
            continue;
        }
        seen.push(id.clone());
        let key = object_key(tenant, project, &id);
        let Ok(bytes) = r2_bytes(&store, &key).await else {
            continue;
        };
        let snapshot: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
        if let Some(parents) = snapshot["parents"].as_array() {
            for parent in parents {
                if let Some(pid) = parent.as_str() {
                    stack.push(pid.to_string());
                }
            }
        }
    }
    Ok(false)
}

pub(crate) async fn walk_tree(
    store: &Bucket,
    tenant: &str,
    project: &str,
    prefix: &str,
    root_tree: &str,
    output: &mut Vec<TreeEntryInfo>,
) -> Result<()> {
    validate_object_id(root_tree)?;
    let mut stack = vec![(
        prefix.to_string(),
        root_tree.to_string(),
        0usize,
        BTreeSet::new(),
    )];
    let mut visited_entries = 0usize;
    while let Some((prefix, tree_id, depth, mut ancestors)) = stack.pop() {
        validate_object_id(&tree_id)?;
        if depth > MAX_TREE_DEPTH {
            return Err(Error::RustError("tree depth limit exceeded".to_string()));
        }
        if !ancestors.insert(tree_id.clone()) {
            return Err(Error::RustError("tree cycle detected".to_string()));
        }
        let bytes = r2_bytes(store, &object_key(tenant, project, &tree_id)).await?;
        let tree: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let Some(entries) = tree["entries"].as_array() else {
            return Err(Error::RustError("malformed tree object".to_string()));
        };
        for entry in entries.iter().rev() {
            visited_entries += 1;
            if visited_entries > MAX_TREE_ENTRIES {
                return Err(Error::RustError("tree entry limit exceeded".to_string()));
            }
            let name = entry["name"]
                .as_str()
                .ok_or_else(|| Error::RustError("malformed tree entry".to_string()))?
                .to_string();
            let id = entry["id"]
                .as_str()
                .ok_or_else(|| Error::RustError("malformed tree entry".to_string()))?
                .to_string();
            let entry_type = entry["entry_type"]
                .as_str()
                .ok_or_else(|| Error::RustError("malformed tree entry".to_string()))?
                .to_string();
            validate_tree_entry_name(&name)?;
            validate_object_id(&id)?;
            if !matches!(entry_type.as_str(), "blob" | "tree") {
                return Err(Error::RustError("unknown tree entry type".to_string()));
            }
            let path = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}/{name}")
            };
            output.push(TreeEntryInfo {
                path: path.clone(),
                name,
                id: id.clone(),
                entry_type: entry_type.clone(),
            });
            if entry_type == "tree" {
                stack.push((path, id, depth + 1, ancestors.clone()));
            }
        }
    }
    output.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(())
}

pub(crate) async fn resolve_tree_path(
    store: &Bucket,
    tenant: &str,
    project: &str,
    root_tree: &str,
    path: &str,
) -> Result<Option<TreeEntryInfo>> {
    validate_object_id(root_tree)?;
    let parts = path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return Ok(None);
    }
    if parts.len() > MAX_TREE_DEPTH {
        return Err(Error::RustError("tree path depth limit exceeded".to_string()));
    }
    for part in &parts {
        validate_tree_entry_name(part)?;
    }
    let mut tree_id = root_tree.to_string();
    let mut prefix = String::new();
    for (index, part) in parts.iter().enumerate() {
        validate_object_id(&tree_id)?;
        let bytes = r2_bytes(store, &object_key(tenant, project, &tree_id)).await?;
        let tree: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let Some(entries) = tree["entries"].as_array() else {
            return Err(Error::RustError("malformed tree object".to_string()));
        };
        let Some(entry) = entries
            .iter()
            .find(|entry| entry["name"].as_str() == Some(*part))
        else {
            return Ok(None);
        };
        let id = entry["id"]
            .as_str()
            .ok_or_else(|| Error::RustError("malformed tree entry".to_string()))?
            .to_string();
        let entry_type = entry["entry_type"]
            .as_str()
            .ok_or_else(|| Error::RustError("malformed tree entry".to_string()))?
            .to_string();
        validate_object_id(&id)?;
        if !matches!(entry_type.as_str(), "blob" | "tree") {
            return Err(Error::RustError("unknown tree entry type".to_string()));
        }
        let current_path = if prefix.is_empty() {
            (*part).to_string()
        } else {
            format!("{prefix}/{part}")
        };
        if index == parts.len() - 1 {
            return Ok(Some(TreeEntryInfo {
                path: current_path,
                name: (*part).to_string(),
                id,
                entry_type,
            }));
        }
        if entry_type != "tree" {
            return Ok(None);
        }
        prefix = current_path;
        tree_id = id;
    }
    Ok(None)
}
