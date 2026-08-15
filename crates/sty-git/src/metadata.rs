use crate::state::{AppState, git_output, repository_path, safe_segment};
use anyhow::{Context, Result};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::Arc,
};
use tokio::process::Command;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IndexRequest {
    repository_id: String,
    owner: String,
    repository: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitIndex {
    repository_id: String,
    default_branch: String,
    commits: Vec<IndexedCommit>,
    branches: Vec<IndexedBranch>,
    entries: Vec<IndexedEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedCommit {
    id: String,
    title: String,
    author: String,
    authored_at: String,
    tree_id: String,
    parents: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedBranch {
    name: String,
    commit_id: String,
}

#[derive(Serialize)]
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

pub(crate) async fn index_repository(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<IndexRequest>,
) -> Response {
    if headers
        .get("x-sty-storage-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    match index_inner(&state, request).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => {
            eprintln!("repository indexing failed: {error:#}");
            (StatusCode::BAD_GATEWAY, "Repository indexing failed.\n").into_response()
        }
    }
}

async fn index_inner(state: &AppState, request: IndexRequest) -> Result<()> {
    if !request.repository_id.starts_with("repo_")
        || !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
    {
        anyhow::bail!("invalid repository index request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    let refs = git_output(
        &repository,
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
        .map(|branch| branch.name.clone())
        .unwrap_or_else(|| "main".into());
    let history = if branches.is_empty() {
        String::new()
    } else {
        git_output(
            &repository,
            &[
                "log",
                "--all",
                "--date=iso-strict",
                "--format=%H%x1f%s%x1f%an%x1f%aI%x1f%T%x1f%P%x1e",
                "-n",
                "5000",
            ],
        )
        .await?
    };
    let commits = parse_records(&history, 6)
        .into_iter()
        .map(|fields| IndexedCommit {
            id: fields[0].clone(),
            title: fields[1].clone(),
            author: fields[2].clone(),
            authored_at: fields[3].clone(),
            tree_id: fields[4].clone(),
            parents: fields[5].split_whitespace().map(str::to_owned).collect(),
        })
        .collect::<Vec<_>>();
    let trees = commits
        .iter()
        .map(|commit| (commit.id.as_str(), commit.tree_id.as_str()))
        .collect::<HashMap<_, _>>();
    let mut indexed = HashSet::new();
    let mut entries = Vec::new();
    for branch in &branches {
        let tree_id = trees
            .get(branch.commit_id.as_str())
            .context("branch commit missing from indexed history")?;
        if indexed.insert(*tree_id) {
            entries.extend(index_tree(&repository, &branch.commit_id, tree_id).await?);
        }
    }
    let payload = GitIndex {
        repository_id: request.repository_id,
        default_branch,
        commits,
        branches,
        entries,
    };
    let response = state
        .client
        .post(format!("{}/api/v1/git/index", state.control_plane))
        .header("x-sty-gateway-token", &state.gateway_token)
        .json(&payload)
        .send()
        .await
        .context("send Git index")?;
    response
        .error_for_status()
        .context("control plane rejected Git index")?;
    Ok(())
}

pub(crate) async fn index_local_repository(
    state: &AppState,
    repository_id: String,
    owner: String,
    repository: String,
) -> Result<()> {
    index_inner(
        state,
        IndexRequest {
            repository_id,
            owner,
            repository,
        },
    )
    .await
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
        .await?;
    if !tree.status.success() {
        anyhow::bail!(
            "git ls-tree failed: {}",
            String::from_utf8_lossy(&tree.stderr)
        )
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
