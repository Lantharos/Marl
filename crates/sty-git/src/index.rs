use crate::state::{AppState, git_output};
use anyhow::{Context, Result};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};
use tokio::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitIndex {
    repository_id: String,
    default_branch: String,
    commits: Vec<IndexedCommit>,
    branches: Vec<IndexedBranch>,
    entries: Vec<IndexedEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedCommit {
    id: String,
    title: String,
    author: String,
    authored_at: String,
    tree_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedBranch {
    name: String,
    commit_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedEntry {
    tree_id: String,
    path: String,
    parent_path: String,
    name: String,
    kind: String,
    object_id: String,
    byte_size: Option<u64>,
}

pub(crate) async fn index_after_push(
    state: &AppState,
    repository: &Path,
    repository_id: String,
    mut auth: reqwest::header::HeaderMap,
) -> Result<()> {
    auth.insert(
        "x-sty-gateway-token",
        reqwest::header::HeaderValue::from_str(&state.gateway_token)?,
    );
    let refs = git_output(
        repository,
        &[
            "for-each-ref",
            "--format=%(refname:short)%1f%(objectname)%1e",
            "refs/heads",
        ],
    )
    .await?;
    let branches = parse_records(&refs, 2)
        .into_iter()
        .map(|fields| IndexedBranch {
            name: fields[0].clone(),
            commit_id: fields[1].clone(),
        })
        .collect::<Vec<_>>();
    let default_branch = branches
        .iter()
        .find(|branch| branch.name == "main")
        .or_else(|| branches.first())
        .context("pushed repository has no branches")?
        .name
        .clone();
    let history = git_output(
        repository,
        &[
            "log",
            "--all",
            "--date=iso-strict",
            "--format=%H%x1f%s%x1f%an%x1f%aI%x1f%T%x1e",
            "-n",
            "5000",
        ],
    )
    .await?;
    let commits = parse_records(&history, 5)
        .into_iter()
        .map(|fields| IndexedCommit {
            id: fields[0].clone(),
            title: fields[1].clone(),
            author: fields[2].clone(),
            authored_at: fields[3].clone(),
            tree_id: fields[4].clone(),
        })
        .collect::<Vec<_>>();
    let commit_trees = commits
        .iter()
        .map(|commit| (commit.id.as_str(), commit.tree_id.as_str()))
        .collect::<HashMap<_, _>>();
    let mut indexed_trees = HashSet::new();
    let mut entries = Vec::new();
    for branch in &branches {
        let tree_id = commit_trees
            .get(branch.commit_id.as_str())
            .context("branch commit missing from history")?;
        if indexed_trees.insert(*tree_id) {
            entries.extend(index_tree(repository, &branch.commit_id, tree_id).await?);
        }
    }
    let payload = GitIndex {
        repository_id,
        default_branch,
        commits,
        branches,
        entries,
    };
    upload_browsable_objects(state, repository, &payload, auth.clone()).await?;
    state
        .client
        .post(format!("{}/api/v1/git/index", state.control_plane))
        .headers(auth)
        .json(&payload)
        .send()
        .await
        .context("send Git index")?
        .error_for_status()
        .context("control plane rejected Git index")?;
    Ok(())
}

async fn index_tree(
    repository: &Path,
    commit_id: &str,
    tree_id: &str,
) -> Result<Vec<IndexedEntry>> {
    let tree = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["ls-tree", "-r", "-t", "-l", "-z", commit_id])
        .output()
        .await
        .context("read Git tree")?;
    if !tree.status.success() {
        anyhow::bail!(
            "git ls-tree failed: {}",
            String::from_utf8_lossy(&tree.stderr)
        );
    }
    let mut entries = Vec::new();
    for record in tree
        .stdout
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let Some(tab) = record.iter().position(|byte| *byte == b'\t') else {
            continue;
        };
        let metadata = String::from_utf8_lossy(&record[..tab]);
        let path = String::from_utf8_lossy(&record[tab + 1..]).into_owned();
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 4 {
            continue;
        }
        let parent_path = Path::new(&path)
            .parent()
            .filter(|value| !value.as_os_str().is_empty())
            .map(|value| value.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let name = Path::new(&path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        entries.push(IndexedEntry {
            tree_id: tree_id.into(),
            path,
            parent_path,
            name,
            kind: fields[1].into(),
            object_id: fields[2].into(),
            byte_size: fields[3].parse().ok(),
        });
    }
    Ok(entries)
}

async fn upload_browsable_objects(
    state: &AppState,
    repository: &Path,
    index: &GitIndex,
    auth: reqwest::header::HeaderMap,
) -> Result<()> {
    let mut uploaded = HashSet::new();
    for entry in index.entries.iter().filter(|entry| entry.kind == "blob") {
        if !uploaded.insert(entry.object_id.clone()) {
            continue;
        }
        let size = entry.byte_size.unwrap_or(0);
        if size > 50 * 1024 * 1024 {
            continue;
        }
        let output = Command::new("git")
            .args(["-C"])
            .arg(repository)
            .args(["cat-file", "blob", &entry.object_id])
            .output()
            .await
            .context("read browsable Git object")?;
        if !output.status.success() {
            anyhow::bail!(
                "git cat-file failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        state
            .client
            .put(format!(
                "{}/api/v1/git/objects/{}/{}",
                state.control_plane, index.repository_id, entry.object_id
            ))
            .headers(auth.clone())
            .header("x-sty-object-size", output.stdout.len())
            .header("content-type", content_type(&entry.path))
            .body(output.stdout)
            .send()
            .await
            .context("upload browsable Git object")?
            .error_for_status()
            .context("control plane rejected Git object")?;
    }
    Ok(())
}

fn content_type(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "md" | "txt" | "rs" | "ts" | "js" | "svelte" | "toml" | "yaml" | "yml" | "css" | "html"
        | "json" => "text/plain; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    }
}

fn parse_records(value: &str, fields: usize) -> Vec<Vec<String>> {
    value
        .split('\x1e')
        .filter_map(|record| {
            let values = record
                .trim_start_matches(['\r', '\n'])
                .trim_end_matches(['\r', '\n'])
                .split('\x1f')
                .map(str::to_owned)
                .collect::<Vec<_>>();
            (values.len() == fields).then_some(values)
        })
        .collect()
}
