use crate::{
    metadata::index_local_repository,
    process::Command,
    state::{AppState, git_output, is_object_id, repository_path, safe_ref, safe_segment},
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteBranchRequest {
    owner: String,
    repository: String,
    repository_id: String,
    branch: String,
    expected_commit_id: String,
    actor_id: String,
}

pub(crate) async fn delete_branch(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DeleteBranchRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let reference = format!("refs/heads/{}", request.branch);
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !request.repository_id.starts_with("repo_")
        || !safe_segment(&request.repository_id)
        || request.branch.starts_with('-')
        || !safe_ref(&reference)
        || !is_object_id(&request.expected_commit_id)
    {
        return StatusCode::UNPROCESSABLE_ENTITY.into_response();
    }
    match delete_branch_inner(&state, request, &reference).await {
        Ok(()) => Json(serde_json::json!({"deleted": true})).into_response(),
        Err(error)
            if error.to_string() == "branch changed" || error.to_string() == "default branch" =>
        {
            StatusCode::CONFLICT.into_response()
        }
        Err(error) => {
            eprintln!("delete branch failed: {error:#}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}

async fn delete_branch_inner(
    state: &AppState,
    request: DeleteBranchRequest,
    reference: &str,
) -> anyhow::Result<()> {
    let _guard = state
        .lock_repository(&request.owner, &request.repository)
        .await;
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    let default_ref = git_output(&repository, &["symbolic-ref", "HEAD"]).await?;
    if default_ref.trim() == reference {
        anyhow::bail!("default branch");
    }
    let current = Command::new("git")
        .arg("-C")
        .arg(&repository)
        .args(["show-ref", "--verify", "--quiet", reference])
        .output()
        .await?;
    if current.status.success() {
        let deletion = Command::new("git")
            .arg("-C")
            .arg(&repository)
            .args(["update-ref", "-d", reference, &request.expected_commit_id])
            .output()
            .await?;
        if !deletion.status.success() {
            anyhow::bail!("branch changed");
        }
    } else if current.status.code() != Some(1) {
        anyhow::bail!("branch could not be read");
    }
    if state.local_storage {
        index_local_repository(
            state,
            request.repository_id,
            request.owner,
            request.repository,
            Some(request.actor_id),
        )
        .await?;
    }
    Ok(())
}
