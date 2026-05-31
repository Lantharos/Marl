use super::prelude::*;
use std::collections::{BTreeSet, HashMap};

use serde::Deserialize;

#[derive(Clone)]
pub(crate) struct ParsedTreeEntry {
    pub name: String,
    pub id: String,
    pub entry_type: String,
}

#[derive(Deserialize)]
struct TreePayload {
    entries: Vec<ParsedTreeEntryPayload>,
}

#[derive(Deserialize)]
struct ParsedTreeEntryPayload {
    name: String,
    id: String,
    entry_type: String,
}

pub(crate) struct TreeWalkOptions {
    pub prefix: String,
    pub max_depth: usize,
    pub limit: usize,
    pub cursor: Option<String>,
}

pub(crate) struct TreePage {
    pub entries: Vec<TreeEntryInfo>,
    pub next_cursor: Option<String>,
    pub truncated: bool,
}

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
        (Some(local), Some(remote)) if is_ancestor(env, tenant, project, remote, local).await? => {
            "local_ahead"
        }
        (Some(local), Some(remote)) if is_ancestor(env, tenant, project, local, remote).await? => {
            "remote_ahead"
        }
        _ => "diverged",
    };
    Ok(relation.to_string())
}

pub(crate) async fn is_ancestor(
    env: &Env,
    tenant: &str,
    project: &str,
    ancestor: &str,
    head: &str,
) -> Result<bool> {
    let mut seen = Vec::new();
    let mut stack = vec![head.to_string()];
    let features = bucket(env)?;
    while let Some(id) = stack.pop() {
        if id == ancestor {
            return Ok(true);
        }
        if seen.contains(&id) {
            continue;
        }
        seen.push(id.clone());
        let key = object_key(tenant, project, &id);
        let Ok(bytes) = r2_bytes(&features, &key).await else {
            continue;
        };
        let snapshot: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
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
    features: &Bucket,
    tenant: &str,
    project: &str,
    prefix: &str,
    root_tree: &str,
    output: &mut Vec<TreeEntryInfo>,
) -> Result<()> {
    let page = walk_tree_page(
        features,
        tenant,
        project,
        root_tree,
        TreeWalkOptions {
            prefix: prefix.to_string(),
            max_depth: MAX_TREE_DEPTH,
            limit: MAX_TREE_ENTRIES,
            cursor: None,
        },
    )
    .await?;
    output.extend(page.entries);
    output.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(())
}

pub(crate) async fn changed_paths_between_snapshots(
    env: &Env,
    tenant: &str,
    project: &str,
    current_head: &str,
    base_head: &str,
) -> Result<Vec<String>> {
    let features = bucket(env)?;
    let current = graph_snapshot_blob_map(&features, tenant, project, current_head).await?;
    let base = graph_snapshot_blob_map(&features, tenant, project, base_head).await?;
    let mut paths = BTreeSet::new();
    for (path, new_id) in &current {
        if base.get(path) != Some(new_id) {
            paths.insert(path.clone());
        }
    }
    for path in base.keys() {
        if !current.contains_key(path) {
            paths.insert(path.clone());
        }
    }
    Ok(paths.into_iter().collect())
}

async fn graph_snapshot_blob_map(
    features: &Bucket,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
) -> Result<HashMap<String, String>> {
    validate_object_id(snapshot_id)?;
    let snapshot_bytes = r2_bytes(features, &object_key(tenant, project, snapshot_id)).await?;
    let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes)
        .map_err(|error| Error::RustError(error.to_string()))?;
    let root_tree = snapshot["root_tree"]
        .as_str()
        .ok_or_else(|| Error::RustError("malformed snapshot object".to_string()))?;
    validate_object_id(root_tree)?;
    let mut entries = Vec::new();
    walk_tree(features, tenant, project, "", root_tree, &mut entries).await?;
    Ok(entries
        .into_iter()
        .filter(|entry| entry.entry_type == "blob")
        .map(|entry| (entry.path, entry.id))
        .collect())
}

pub(crate) async fn walk_tree_page(
    features: &Bucket,
    tenant: &str,
    project: &str,
    root_tree: &str,
    options: TreeWalkOptions,
) -> Result<TreePage> {
    validate_object_id(root_tree)?;
    let Some((prefix, start_tree)) =
        resolve_tree_prefix(features, tenant, project, root_tree, &options.prefix).await?
    else {
        return Ok(TreePage {
            entries: Vec::new(),
            next_cursor: None,
            truncated: false,
        });
    };
    let mut stack = vec![(prefix, start_tree, 0usize, BTreeSet::new())];
    let mut visited_entries = 0usize;
    let mut output: Vec<TreeEntryInfo> = Vec::new();
    let mut next_cursor = None;
    let mut after_cursor = options.cursor.is_none();
    while let Some((prefix, tree_id, depth, mut ancestors)) = stack.pop() {
        validate_object_id(&tree_id)?;
        if depth > MAX_TREE_DEPTH {
            return Err(Error::RustError("tree depth limit exceeded".to_string()));
        }
        if !ancestors.insert(tree_id.clone()) {
            return Err(Error::RustError("tree cycle detected".to_string()));
        }
        let bytes = r2_bytes(features, &object_key(tenant, project, &tree_id)).await?;
        let mut entries = parse_tree_entries(&bytes)?;
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        for entry in entries.into_iter().rev() {
            visited_entries += 1;
            if visited_entries > MAX_TREE_ENTRIES {
                return Err(Error::RustError("tree entry limit exceeded".to_string()));
            }
            let path = if prefix.is_empty() {
                entry.name.clone()
            } else {
                format!("{prefix}/{}", entry.name)
            };
            if after_cursor {
                if output.len() >= options.limit {
                    next_cursor = output.last().map(|entry| entry.path.clone());
                    return Ok(TreePage {
                        entries: output,
                        next_cursor,
                        truncated: true,
                    });
                }
                output.push(TreeEntryInfo {
                    path: path.clone(),
                    name: entry.name.clone(),
                    id: entry.id.clone(),
                    entry_type: entry.entry_type.clone(),
                });
            } else if options.cursor.as_deref() == Some(path.as_str()) {
                after_cursor = true;
            }
            if entry.entry_type == "tree" && depth < options.max_depth {
                stack.push((path, entry.id, depth + 1, ancestors.clone()));
            }
        }
    }
    Ok(TreePage {
        entries: output,
        next_cursor: next_cursor.take(),
        truncated: false,
    })
}

pub(crate) async fn validate_tree_closure(
    features: &Bucket,
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    root_tree: &str,
) -> Result<()> {
    validate_object_id(root_tree)?;
    let mut stack = vec![(root_tree.to_string(), 0usize, BTreeSet::new())];
    let mut visited_entries = 0usize;
    while let Some((tree_id, depth, mut ancestors)) = stack.pop() {
        validate_object_id(&tree_id)?;
        if depth > MAX_TREE_DEPTH {
            return Err(Error::RustError("tree depth limit exceeded".to_string()));
        }
        if !ancestors.insert(tree_id.clone()) {
            return Err(Error::RustError("tree cycle detected".to_string()));
        }
        let bytes = r2_bytes(features, &object_key(tenant, project, &tree_id)).await?;
        let entries = parse_tree_entries(&bytes)?;
        visited_entries += entries.len();
        if visited_entries > MAX_TREE_ENTRIES {
            return Err(Error::RustError("tree entry limit exceeded".to_string()));
        }
        let ids = entries
            .iter()
            .map(|entry| entry.id.clone())
            .collect::<Vec<_>>();
        let kinds = features::object_kinds(db, tenant, project, &ids).await?;
        for entry in entries {
            match kinds.get(&entry.id) {
                Some(kind) if kind == &entry.entry_type => {}
                Some(_) => {
                    return Err(Error::RustError(
                        "tree entry object kind mismatch".to_string(),
                    ));
                }
                None => return Err(Error::RustError("tree entry object is missing".to_string())),
            }
            if entry.entry_type == "tree" {
                stack.push((entry.id, depth + 1, ancestors.clone()));
            }
        }
    }
    Ok(())
}

pub(crate) async fn resolve_tree_path(
    features: &Bucket,
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
        return Err(Error::RustError(
            "tree path depth limit exceeded".to_string(),
        ));
    }
    for part in &parts {
        validate_tree_entry_name(part)?;
    }
    let mut tree_id = root_tree.to_string();
    let mut prefix = String::new();
    for (index, part) in parts.iter().enumerate() {
        validate_object_id(&tree_id)?;
        let bytes = r2_bytes(features, &object_key(tenant, project, &tree_id)).await?;
        let tree: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
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

async fn resolve_tree_prefix(
    features: &Bucket,
    tenant: &str,
    project: &str,
    root_tree: &str,
    prefix: &str,
) -> Result<Option<(String, String)>> {
    let prefix = normalize_tree_prefix(prefix)?;
    if prefix.is_empty() {
        return Ok(Some((String::new(), root_tree.to_string())));
    }
    match resolve_tree_path(features, tenant, project, root_tree, &prefix).await? {
        Some(entry) if entry.entry_type == "tree" => Ok(Some((prefix, entry.id))),
        Some(_) => Err(Error::RustError(
            "tree prefix must be a directory".to_string(),
        )),
        None => Ok(None),
    }
}

pub(crate) fn normalize_tree_prefix(prefix: &str) -> Result<String> {
    let parts = prefix
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.len() > MAX_TREE_DEPTH {
        return Err(Error::RustError(
            "tree path depth limit exceeded".to_string(),
        ));
    }
    for part in &parts {
        validate_tree_entry_name(part)?;
    }
    Ok(parts.join("/"))
}

pub(crate) fn parse_tree_entries(bytes: &[u8]) -> Result<Vec<ParsedTreeEntry>> {
    let payload: TreePayload =
        serde_json::from_slice(bytes).map_err(|error| Error::RustError(error.to_string()))?;
    payload
        .entries
        .into_iter()
        .map(|entry| {
            validate_tree_entry_name(&entry.name)?;
            validate_object_id(&entry.id)?;
            if !matches!(entry.entry_type.as_str(), "blob" | "tree") {
                return Err(Error::RustError("unknown tree entry type".to_string()));
            }
            Ok(ParsedTreeEntry {
                name: entry.name,
                id: entry.id,
                entry_type: entry.entry_type,
            })
        })
        .collect()
}
