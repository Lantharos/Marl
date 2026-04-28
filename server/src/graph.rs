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
    let mut stack = vec![(prefix.to_string(), root_tree.to_string())];
    while let Some((prefix, tree_id)) = stack.pop() {
        let bytes = r2_bytes(store, &object_key(tenant, project, &tree_id)).await?;
        let tree: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let Some(entries) = tree["entries"].as_array() else {
            continue;
        };
        for entry in entries.iter().rev() {
            let name = entry["name"].as_str().unwrap_or_default().to_string();
            let id = entry["id"].as_str().unwrap_or_default().to_string();
            let entry_type = entry["entry_type"].as_str().unwrap_or_default().to_string();
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
                stack.push((path, id));
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
    let parts = path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return Ok(None);
    }
    let mut tree_id = root_tree.to_string();
    let mut prefix = String::new();
    for (index, part) in parts.iter().enumerate() {
        let bytes = r2_bytes(store, &object_key(tenant, project, &tree_id)).await?;
        let tree: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let Some(entries) = tree["entries"].as_array() else {
            return Ok(None);
        };
        let Some(entry) = entries.iter().find(|entry| entry["name"].as_str() == Some(*part)) else {
            return Ok(None);
        };
        let id = entry["id"].as_str().unwrap_or_default().to_string();
        let entry_type = entry["entry_type"].as_str().unwrap_or_default().to_string();
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
