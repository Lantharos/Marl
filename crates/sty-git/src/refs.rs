use crate::state::{AppState, git_output, is_object_id, repository_path, safe_segment};
use anyhow::Result;
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Arc};
use tokio::process::Command;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PinPullRequest {
    owner: String,
    repository: String,
    number: u64,
    source_commit_id: String,
    target_commit_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PinPullResponse {
    head_ref: String,
    base_ref: String,
}

pub(crate) async fn pin_pull(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<PinPullRequest>,
) -> Response {
    if headers
        .get("x-sty-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match pin_pull_inner(&state, request).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) if error.to_string().starts_with("pull ref conflict") => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error":"Pull request refs already point to different commits."})),
        )
            .into_response(),
        Err(error) => {
            eprintln!("pin pull refs failed: {error:#}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}

async fn pin_pull_inner(state: &AppState, request: PinPullRequest) -> Result<PinPullResponse> {
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || request.number == 0
        || !is_object_id(&request.source_commit_id)
        || !is_object_id(&request.target_commit_id)
    {
        anyhow::bail!("invalid pull ref request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    verify_commit(&repository, &request.source_commit_id).await?;
    verify_commit(&repository, &request.target_commit_id).await?;
    let prefix = format!("refs/sty/pulls/{}", request.number);
    let head_ref = format!("{prefix}/head");
    let base_ref = format!("{prefix}/base");
    ensure_ref(&repository, &head_ref, &request.source_commit_id).await?;
    ensure_ref(&repository, &base_ref, &request.target_commit_id).await?;
    Ok(PinPullResponse { head_ref, base_ref })
}

async fn verify_commit(repository: &Path, object_id: &str) -> Result<()> {
    git_output(
        repository,
        &["cat-file", "-e", &format!("{object_id}^{{commit}}")],
    )
    .await?;
    Ok(())
}

async fn ensure_ref(repository: &Path, name: &str, object_id: &str) -> Result<()> {
    let existing = git_output(repository, &["rev-parse", "--verify", "--quiet", name]).await;
    match existing {
        Ok(value) if value.trim() == object_id => return Ok(()),
        Ok(_) => anyhow::bail!("pull ref conflict"),
        Err(_) => {}
    }
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["update-ref", name, object_id, &"0".repeat(object_id.len())])
        .output()
        .await?;
    if !output.status.success() {
        let recovered = git_output(repository, &["rev-parse", "--verify", "--quiet", name]).await?;
        if recovered.trim() != object_id {
            anyhow::bail!("pull ref conflict")
        }
    }
    Ok(())
}
