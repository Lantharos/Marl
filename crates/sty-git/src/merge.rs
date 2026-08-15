use crate::state::{AppState, git_output, is_object_id, repository_path, safe_ref, safe_segment};
use anyhow::{Context, Result};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::process::Command;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MergeRequest {
    repository_id: String,
    owner: String,
    repository: String,
    source_branch: String,
    target_branch: String,
    source_commit_id: String,
    target_commit_id: String,
    title: String,
    author: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MergeResponse {
    commit_id: String,
}

pub(crate) async fn merge_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<MergeRequest>,
) -> Response {
    if headers
        .get("x-sty-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Gateway authentication failed."})),
        )
            .into_response();
    }
    match perform_merge(&state, request).await {
        Ok(value) => (StatusCode::OK, Json(value)).into_response(),
        Err(error) if error.to_string().starts_with("merge conflict") => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error":"Branches contain merge conflicts."})),
        )
            .into_response(),
        Err(error) => {
            eprintln!("merge failed: {error:#}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error":"Git merge failed."})),
            )
                .into_response()
        }
    }
}

async fn perform_merge(state: &AppState, request: MergeRequest) -> Result<MergeResponse> {
    if !request.repository_id.starts_with("repo_")
        || !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !safe_ref(&request.source_branch)
        || !safe_ref(&request.target_branch)
        || !is_object_id(&request.source_commit_id)
        || !is_object_id(&request.target_commit_id)
    {
        anyhow::bail!("invalid merge request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    let source_ref = format!("refs/heads/{}", request.source_branch);
    let target_ref = format!("refs/heads/{}", request.target_branch);
    let source = git_output(&repository, &["rev-parse", &source_ref])
        .await?
        .trim()
        .to_owned();
    let target = git_output(&repository, &["rev-parse", &target_ref])
        .await?
        .trim()
        .to_owned();
    if source != request.source_commit_id || target != request.target_commit_id {
        anyhow::bail!("stale branch head")
    }
    let ancestor = Command::new("git")
        .args(["-C"])
        .arg(&repository)
        .args(["merge-base", "--is-ancestor", &target, &source])
        .status()
        .await?;
    let commit_id = if ancestor.success() {
        source.clone()
    } else {
        let merge_tree = Command::new("git")
            .args(["-C"])
            .arg(&repository)
            .args(["merge-tree", "--write-tree", &target, &source])
            .output()
            .await?;
        if !merge_tree.status.success() {
            anyhow::bail!(
                "merge conflict: {}",
                String::from_utf8_lossy(&merge_tree.stdout)
            );
        }
        let tree = String::from_utf8(merge_tree.stdout)?
            .lines()
            .next()
            .context("merge-tree did not return a tree")?
            .trim()
            .to_owned();
        let output = Command::new("git")
            .args(["-C"])
            .arg(&repository)
            .args([
                "commit-tree",
                &tree,
                "-p",
                &target,
                "-p",
                &source,
                "-m",
                &request.title,
            ])
            .env("GIT_AUTHOR_NAME", &request.author)
            .env(
                "GIT_AUTHOR_EMAIL",
                format!("{}@users.sty.sh", request.author),
            )
            .env("GIT_COMMITTER_NAME", &request.author)
            .env(
                "GIT_COMMITTER_EMAIL",
                format!("{}@users.sty.sh", request.author),
            )
            .output()
            .await?;
        if !output.status.success() {
            anyhow::bail!(
                "commit-tree failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        String::from_utf8(output.stdout)?.trim().to_owned()
    };
    let update = Command::new("git")
        .args(["-C"])
        .arg(&repository)
        .args(["update-ref", &target_ref, &commit_id, &target])
        .output()
        .await?;
    if !update.status.success() {
        anyhow::bail!("stale branch head")
    }
    Ok(MergeResponse { commit_id })
}
