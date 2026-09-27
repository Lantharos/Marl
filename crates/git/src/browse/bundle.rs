use crate::{
    process::Command,
    state::{AppState, repository_path, safe_segment},
};
use anyhow::{Context, Result};
use axum::{
    Json,
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::{process::Stdio, sync::Arc};
use tokio_util::io::ReaderStream;

#[derive(Deserialize)]
pub(crate) struct BundleRequest {
    owner: String,
    repository: String,
}

pub(crate) async fn repository_bundle(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<BundleRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match bundle_inner(&state, request).await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("repository bundle failed: {error:#}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}

async fn bundle_inner(state: &AppState, request: BundleRequest) -> Result<Response> {
    if !safe_segment(&request.owner) || !safe_segment(&request.repository) {
        anyhow::bail!("invalid bundle request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    if !repository.exists() {
        return Ok(StatusCode::NOT_FOUND.into_response());
    }
    let refs = crate::state::git_output(
        &repository,
        &["for-each-ref", "--count=1", "refs/heads", "refs/tags"],
    )
    .await?;
    if refs.trim().is_empty() {
        return Ok(StatusCode::NOT_FOUND.into_response());
    }
    let mut child = Command::new("git")
        .args(["-C"])
        .arg(&repository)
        .args(["bundle", "create", "-", "--branches", "--tags"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .context("start git bundle")?;
    let stdout = child.stdout.take().context("open git bundle output")?;
    tokio::spawn(async move {
        if let Ok(output) = child.wait_with_output().await
            && !output.status.success()
        {
            eprintln!(
                "git bundle stream failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    });
    Ok(Response::builder()
        .header("content-type", "application/x-git-bundle")
        .header("cache-control", "private, no-store")
        .header("x-content-type-options", "nosniff")
        .body(Body::from_stream(ReaderStream::new(stdout)))?)
}
