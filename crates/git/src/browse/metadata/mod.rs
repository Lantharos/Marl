use crate::process::Command;
use crate::state::{AppState, git_output, is_object_id, repository_path, safe_segment};
use anyhow::{Context, Result};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path, sync::Arc};
use tokio::time::{Duration, sleep};

mod parse;
mod tree;

use parse::{parse_changed_paths, parse_records};
use tree::index_tree;
pub(crate) use tree::read_tree;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IndexRequest {
    repository_id: String,
    owner: String,
    repository: String,
    #[serde(default)]
    index_id: String,
    #[serde(default)]
    exclude_commits: Vec<String>,
    #[serde(default)]
    actor_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitIndexPage<'a> {
    repository_id: &'a str,
    index_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    actor_id: Option<&'a str>,
    complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_branch: Option<&'a str>,
    commits: &'a [IndexedCommit],
    branches: &'a [IndexedBranch],
    entries: &'a [IndexedEntry],
    changes: &'a [IndexedChange],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedCommit {
    id: String,
    title: String,
    author: String,
    author_email: String,
    authored_at: String,
    tree_id: String,
    parents: Vec<String>,
    signature_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    signature_signer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    signature_key_fingerprint: Option<String>,
    #[serde(skip)]
    position: usize,
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
            .header("x-marl-gateway-token", &state.gateway_token)
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
        .get("x-marl-storage-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    match index_inner(&state, request).await {
        Ok(heads) => Json(serde_json::json!({ "heads": heads })).into_response(),
        Err(error) => {
            eprintln!("repository indexing failed: {error:#}");
            (StatusCode::BAD_GATEWAY, "Repository indexing failed.\n").into_response()
        }
    }
}

async fn index_inner(state: &AppState, request: IndexRequest) -> Result<Vec<String>> {
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
    let head = git_output(&repository, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .await
        .unwrap_or_default();
    let default_branch = branches
        .iter()
        .find(|branch| branch.name == head.trim())
        .or_else(|| branches.iter().find(|branch| branch.name == "main"))
        .or_else(|| branches.first())
        .map(|branch| branch.name.clone())
        .unwrap_or_else(|| "main".into());
    let history = if branches.is_empty() {
        String::new()
    } else {
        let mut command = Command::new("git");
        command.args(["-C"]).arg(&repository).args([
            "log",
            "--all",
            "--topo-order",
            "--date=iso-strict",
            "--format=%H%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%T%x1f%P%x1f%ct%x1e",
            "--ignore-missing",
        ]);
        for commit in request
            .exclude_commits
            .iter()
            .filter(|commit| is_object_id(commit))
        {
            command.arg("--not").arg(commit);
        }
        let output = command.output().await?;
        if !output.status.success() {
            anyhow::bail!(
                "git log failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )
        }
        String::from_utf8(output.stdout)?
    };
    let mut commits = parse_records(&history, 8)
        .into_iter()
        .map(|fields| IndexedCommit {
            id: fields[0].clone(),
            title: fields[1].clone(),
            author: fields[2].clone(),
            author_email: fields[3].clone(),
            authored_at: fields[4].clone(),
            tree_id: fields[5].clone(),
            parents: fields[6].split_whitespace().map(str::to_owned).collect(),
            position: fields[7].parse().unwrap_or(0),
            signature_status: "unverified".into(),
            signature_signer_id: None,
            signature_key_fingerprint: None,
        })
        .collect::<Vec<_>>();
    verify_commit_signatures(state, &repository, &mut commits).await?;
    let changes = index_changes(&repository, &commits, &request.exclude_commits).await?;
    let mut indexed = HashSet::new();
    let mut entries = Vec::new();
    for branch in &branches {
        let tree_id = git_output(
            &repository,
            &["rev-parse", &format!("{}^{{tree}}", branch.commit_id)],
        )
        .await?;
        let tree_id = tree_id.trim();
        if indexed.insert(tree_id.to_owned()) {
            entries.extend(index_tree(&repository, &branch.commit_id, tree_id).await?);
        }
    }
    let index_id = if request.index_id.is_empty() {
        format!(
            "index_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_nanos()
        )
    } else {
        request.index_id
    };
    for page in commits.chunks(250) {
        send_index_page(
            state,
            GitIndexPage {
                repository_id: &request.repository_id,
                index_id: &index_id,
                actor_id: request.actor_id.as_deref(),
                complete: false,
                default_branch: None,
                commits: page,
                branches: &[],
                entries: &[],
                changes: &[],
            },
        )
        .await?;
    }
    let mut change_start = 0;
    while change_start < changes.len() {
        let mut change_end = change_start;
        let mut path_count = 0;
        while change_end < changes.len() && change_end - change_start < 250 {
            let next = changes[change_end].paths.len();
            if next > 100_000 {
                anyhow::bail!(
                    "a commit changes more paths than the metadata index can safely accept"
                )
            }
            if change_end > change_start && path_count + next > 100_000 {
                break;
            }
            path_count += next;
            change_end += 1;
        }
        send_index_page(
            state,
            GitIndexPage {
                repository_id: &request.repository_id,
                index_id: &index_id,
                actor_id: request.actor_id.as_deref(),
                complete: false,
                default_branch: None,
                commits: &[],
                branches: &[],
                entries: &[],
                changes: &changes[change_start..change_end],
            },
        )
        .await?;
        change_start = change_end;
    }
    for page in entries.chunks(1_000) {
        send_index_page(
            state,
            GitIndexPage {
                repository_id: &request.repository_id,
                index_id: &index_id,
                actor_id: request.actor_id.as_deref(),
                complete: false,
                default_branch: None,
                commits: &[],
                branches: &[],
                entries: page,
                changes: &[],
            },
        )
        .await?;
    }
    for page in branches.chunks(250) {
        send_index_page(
            state,
            GitIndexPage {
                repository_id: &request.repository_id,
                index_id: &index_id,
                actor_id: request.actor_id.as_deref(),
                complete: false,
                default_branch: None,
                commits: &[],
                branches: page,
                entries: &[],
                changes: &[],
            },
        )
        .await?;
    }
    send_index_page(
        state,
        GitIndexPage {
            repository_id: &request.repository_id,
            index_id: &index_id,
            actor_id: request.actor_id.as_deref(),
            complete: true,
            default_branch: Some(&default_branch),
            commits: &[],
            branches: &[],
            entries: &[],
            changes: &[],
        },
    )
    .await?;
    if let Some(branch) = branches.iter().find(|branch| branch.name == default_branch)
        && let Err(error) = crate::browse::symbols::index_symbols(
            state,
            &repository,
            &request.repository_id,
            &branch.commit_id,
        )
        .await
    {
        eprintln!("symbol indexing failed: {error:#}");
    }
    Ok(branches
        .into_iter()
        .map(|branch| branch.commit_id)
        .collect())
}

async fn verify_commit_signatures(
    state: &AppState,
    repository: &Path,
    commits: &mut [IndexedCommit],
) -> Result<()> {
    use crate::signing::signatures::{
        POLICY_BATCH, SignatureVerifier, load_policy, read_commit_identities,
    };
    for batch in commits.chunks_mut(POLICY_BATCH) {
        let ids = batch
            .iter()
            .map(|commit| commit.id.clone())
            .collect::<Vec<_>>();
        let identities = read_commit_identities(repository, &ids).await?;
        let emails = identities
            .iter()
            .filter(|commit| commit.ssh_signed)
            .map(|commit| commit.author_email.clone())
            .collect::<Vec<_>>();
        if emails.is_empty() {
            continue;
        }
        let mut verifier = SignatureVerifier::new(load_policy(state, None, &emails).await?);
        for (commit, identity) in batch.iter_mut().zip(&identities) {
            let verification = verifier.verify(repository, identity).await?;
            commit.signature_status = verification.status.into();
            commit.signature_signer_id = verification.signer_id;
            commit.signature_key_fingerprint = verification.fingerprint;
        }
    }
    Ok(())
}

async fn send_index_page(state: &AppState, page: GitIndexPage<'_>) -> Result<()> {
    state
        .client
        .post(format!("{}/api/v1/git/index", state.control_plane))
        .header("x-marl-gateway-token", &state.gateway_token)
        .json(&page)
        .send()
        .await
        .context("send Git index page")?
        .error_for_status()
        .context("control plane rejected Git index page")?;
    Ok(())
}

async fn index_changes(
    repository: &Path,
    commits: &[IndexedCommit],
    exclude_commits: &[String],
) -> Result<Vec<IndexedChange>> {
    if commits.is_empty() {
        return Ok(Vec::new());
    }
    let mut command = Command::new("git");
    command.args(["-C"]).arg(repository).args([
        "log",
        "--all",
        "--topo-order",
        "--ignore-missing",
        "--format=C%H%x00",
        "--name-status",
        "-z",
        "--no-renames",
    ]);
    for commit in exclude_commits.iter().filter(|commit| is_object_id(commit)) {
        command.arg("--not").arg(commit);
    }
    let output = command.output().await?;
    if !output.status.success() {
        anyhow::bail!(
            "git log changed paths failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
    Ok(parse_changed_paths(&output.stdout, commits))
}

pub(crate) async fn index_local_repository(
    state: &AppState,
    repository_id: String,
    owner: String,
    repository: String,
    actor_id: Option<String>,
) -> Result<()> {
    index_inner(
        state,
        IndexRequest {
            repository_id,
            owner,
            repository,
            index_id: String::new(),
            exclude_commits: Vec::new(),
            actor_id,
        },
    )
    .await
    .map(|_| ())
}
