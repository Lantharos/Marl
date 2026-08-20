use crate::{
    metadata::index_local_repository,
    process::Command,
    repository_files::{ensure_bare_repository, repair_head},
    state::{AppState, repository_path, safe_segment},
};
use anyhow::{Context, Result};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::{process::Stdio, sync::Arc};
use tokio::fs;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ForkRequest {
    repository_id: String,
    source_owner: String,
    source_repository: String,
    destination_owner: String,
    destination_repository: String,
    actor_id: String,
}

pub(crate) async fn fork_repository(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ForkRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    match fork_inner(&state, &request).await {
        Ok(()) => StatusCode::CREATED.into_response(),
        Err(error) => {
            eprintln!("repository fork failed: {error:#}");
            (
                StatusCode::BAD_GATEWAY,
                "Repository storage could not be forked.\n",
            )
                .into_response()
        }
    }
}

async fn fork_inner(state: &AppState, request: &ForkRequest) -> Result<()> {
    if request.repository_id.is_empty()
        || [
            &request.source_owner,
            &request.source_repository,
            &request.destination_owner,
            &request.destination_repository,
        ]
        .into_iter()
        .any(|value| !safe_segment(value))
    {
        anyhow::bail!("invalid repository fork request");
    }
    let source = repository_path(
        &state.repositories,
        &request.source_owner,
        &request.source_repository,
    )?;
    let destination = repository_path(
        &state.repositories,
        &request.destination_owner,
        &request.destination_repository,
    )?;
    if fs::metadata(&destination).await.is_ok() {
        anyhow::bail!("destination repository storage already exists");
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).await?;
    }
    let result = async {
        if fs::metadata(&source).await.is_ok() {
            let output = Command::new("git")
                .args(["clone", "--bare", "--no-hardlinks", "--"])
                .arg(&source)
                .arg(&destination)
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .output()
                .await?;
            if !output.status.success() {
                anyhow::bail!(
                    "git clone failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            }
        } else {
            ensure_bare_repository(&destination).await?;
        }
        repair_head(&destination).await?;
        index_local_repository(
            state,
            request.repository_id.clone(),
            request.destination_owner.clone(),
            request.destination_repository.clone(),
            Some(request.actor_id.clone()),
        )
        .await?;
        Result::<()>::Ok(())
    }
    .await;
    if result.is_err() {
        fs::remove_dir_all(&destination).await.ok();
    }
    result.context("copy and index fork")
}
