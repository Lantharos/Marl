use crate::state::{
    AppState, git_output, is_object_id, repository_path, safe_repository_path, safe_segment,
};
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
use tokio::time::{Duration, sleep};

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
    changes: Vec<IndexedChange>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedChange {
    commit_id: String,
    position: usize,
    paths: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TreeRequest {
    owner: String,
    repository: String,
    commit_id: String,
    path: String,
}

#[derive(Serialize)]
struct TreeResponse {
    entries: Vec<IndexedEntry>,
}

#[derive(Deserialize)]
struct PendingIndexes {
    repositories: Vec<IndexRequest>,
}

pub(crate) async fn backfill_pending_repositories(state: Arc<AppState>) {
    for attempt in 0..10 {
        let response = state
            .client
            .get(format!(
                "{}/api/v1/git/pending-indexes",
                state.control_plane
            ))
            .header("x-sty-gateway-token", &state.gateway_token)
            .send()
            .await;
        match response {
            Ok(response) if response.status().is_success() => {
                match response.json::<PendingIndexes>().await {
                    Ok(pending) => {
                        for repository in pending.repositories {
                            if let Err(error) = index_inner(&state, repository).await {
                                eprintln!("repository history backfill failed: {error:#}");
                            }
                        }
                    }
                    Err(error) => eprintln!("decode pending repository indexes failed: {error:#}"),
                }
                return;
            }
            Ok(response) => eprintln!(
                "pending repository index request failed with {}",
                response.status()
            ),
            Err(error) if attempt == 9 => {
                eprintln!("pending repository index request failed: {error:#}")
            }
            Err(_) => {}
        }
        sleep(Duration::from_millis(250 * (attempt + 1))).await;
    }
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

pub(crate) async fn read_tree(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TreeRequest>,
) -> Response {
    if headers
        .get("x-sty-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    match read_tree_inner(&state, request).await {
        Ok(entries) => Json(TreeResponse { entries }).into_response(),
        Err(error) => {
            eprintln!("repository tree read failed: {error:#}");
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn read_tree_inner(state: &AppState, request: TreeRequest) -> Result<Vec<IndexedEntry>> {
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !is_object_id(&request.commit_id)
        || (!request.path.is_empty() && !safe_repository_path(&request.path))
    {
        anyhow::bail!("invalid repository tree request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    let tree_id = git_output(
        &repository,
        &["rev-parse", &format!("{}^{{tree}}", request.commit_id)],
    )
    .await?;
    let treeish = if request.path.is_empty() {
        request.commit_id
    } else {
        format!("{}:{}", request.commit_id, request.path)
    };
    let output = Command::new("git")
        .args(["-C"])
        .arg(&repository)
        .args(["ls-tree", "-l", "-z", &treeish])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "git ls-tree failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
    Ok(parse_tree_entries(
        &output.stdout,
        tree_id.trim(),
        &request.path,
    ))
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
                "--topo-order",
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
    let changes = index_changes(&repository, &commits).await?;
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
        changes,
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

async fn index_changes(repository: &Path, commits: &[IndexedCommit]) -> Result<Vec<IndexedChange>> {
    if commits.is_empty() {
        return Ok(Vec::new());
    }
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args([
            "log",
            "--all",
            "--topo-order",
            "-n",
            "5000",
            "--format=C%H%x00",
            "--name-status",
            "-z",
            "--no-renames",
        ])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "git log changed paths failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
    Ok(parse_changed_paths(&output.stdout, commits))
}

fn parse_changed_paths(output: &[u8], commits: &[IndexedCommit]) -> Vec<IndexedChange> {
    let positions = commits
        .iter()
        .enumerate()
        .map(|(index, commit)| (commit.id.as_str(), index))
        .collect::<HashMap<_, _>>();
    let mut paths = vec![HashSet::new(); commits.len()];
    let mut generations = vec![0; commits.len()];
    for (index, commit) in commits.iter().enumerate().rev() {
        generations[index] = commit
            .parents
            .iter()
            .filter_map(|parent| positions.get(parent.as_str()))
            .map(|parent| generations[*parent])
            .max()
            .unwrap_or(0)
            + 1;
    }
    let mut current = None;
    let mut tokens = output
        .split(|byte| *byte == 0)
        .filter(|token| !token.is_empty());
    while let Some(token) = tokens.next() {
        if token.first() == Some(&b'C') {
            current = std::str::from_utf8(&token[1..])
                .ok()
                .and_then(|id| positions.get(id).copied());
            continue;
        }
        if token.len() != 1 || !token[0].is_ascii_alphabetic() {
            current = None;
            continue;
        }
        let Some(path) = tokens.next() else { break };
        let Some(index) = current else { continue };
        let path = String::from_utf8_lossy(path).replace('\\', "/");
        if path.is_empty() {
            continue;
        }
        paths[index].insert(path.clone());
        let mut ancestor = path.as_str();
        while let Some((parent, _)) = ancestor.rsplit_once('/') {
            paths[index].insert(parent.to_owned());
            ancestor = parent;
        }
    }
    commits
        .iter()
        .zip(paths)
        .enumerate()
        .map(|(position, (commit, paths))| {
            let mut paths = paths.into_iter().collect::<Vec<_>>();
            paths.sort_unstable();
            IndexedChange {
                commit_id: commit.id.clone(),
                position: generations[position],
                paths,
            }
        })
        .collect()
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
    Ok(parse_tree_entries(&tree.stdout, tree_id, ""))
}

fn parse_tree_entries(output: &[u8], tree_id: &str, prefix: &str) -> Vec<IndexedEntry> {
    let mut entries = Vec::new();
    for record in output
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let Some(tab) = record.iter().position(|byte| *byte == b'\t') else {
            continue;
        };
        let metadata = String::from_utf8_lossy(&record[..tab]);
        let name_path = String::from_utf8_lossy(&record[tab + 1..]);
        let path = if prefix.is_empty() {
            name_path.into_owned()
        } else {
            format!("{prefix}/{name_path}")
        };
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
    entries
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

#[cfg(test)]
mod tests {
    use super::*;

    fn commit(id: &str, parents: &[&str]) -> IndexedCommit {
        IndexedCommit {
            id: id.into(),
            title: String::new(),
            author: String::new(),
            authored_at: String::new(),
            tree_id: String::new(),
            parents: parents.iter().map(|parent| (*parent).to_owned()).collect(),
        }
    }

    #[test]
    fn changed_paths_include_parent_directories() {
        let first = "1111111111111111111111111111111111111111";
        let second = "2222222222222222222222222222222222222222";
        let output = format!("C{first}\0\0M\0apps/web/src/app.ts\0C{second}\0\0A\0README.md\0");
        let changes = parse_changed_paths(
            output.as_bytes(),
            &[commit(first, &[second]), commit(second, &[])],
        );
        assert_eq!(
            changes[0].paths,
            ["apps", "apps/web", "apps/web/src", "apps/web/src/app.ts"]
        );
        assert_eq!(changes[1].paths, ["README.md"]);
        assert_eq!(changes[0].position, 2);
        assert_eq!(changes[1].position, 1);
    }

    #[test]
    fn tree_entries_preserve_the_requested_directory() {
        let tree_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let blob_id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        let output = format!("100644 blob {blob_id} 12\tapp.ts\0");
        let entries = parse_tree_entries(output.as_bytes(), tree_id, "apps/web");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "apps/web/app.ts");
        assert_eq!(entries[0].parent_path, "apps/web");
        assert_eq!(entries[0].object_id, blob_id);
        assert_eq!(entries[0].byte_size, Some(12));
    }
}
