use super::{IndexedEntry, parse::parse_tree_entries};
use crate::process::Command;
use crate::state::{
    AppState, git_output, is_object_id, repository_path, safe_repository_path, safe_segment,
};
use anyhow::Result;
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Arc};

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

pub(crate) async fn read_tree(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TreeRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
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

pub(super) async fn index_tree(
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
