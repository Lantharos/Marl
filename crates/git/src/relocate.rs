use crate::state::{AppState, repository_path, safe_segment};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::sync::Arc;
use tokio::fs;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RelocateRequest {
    old_owner: String,
    old_repository: String,
    new_owner: String,
    new_repository: String,
}

pub(crate) async fn relocate_repository(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<RelocateRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    if [
        &request.old_owner,
        &request.old_repository,
        &request.new_owner,
        &request.new_repository,
    ]
    .into_iter()
    .any(|value| !safe_segment(value))
    {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            "Invalid repository identity.\n",
        )
            .into_response();
    }
    let old = match repository_path(
        &state.repositories,
        &request.old_owner,
        &request.old_repository,
    ) {
        Ok(path) => path,
        Err(_) => return StatusCode::UNPROCESSABLE_ENTITY.into_response(),
    };
    let new = match repository_path(
        &state.repositories,
        &request.new_owner,
        &request.new_repository,
    ) {
        Ok(path) => path,
        Err(_) => return StatusCode::UNPROCESSABLE_ENTITY.into_response(),
    };
    if old == new || fs::metadata(&old).await.is_err() {
        return StatusCode::NO_CONTENT.into_response();
    }
    if fs::metadata(&new).await.is_ok() {
        return (
            StatusCode::CONFLICT,
            "Destination repository storage already exists.\n",
        )
            .into_response();
    }
    if let Some(parent) = new.parent()
        && let Err(error) = fs::create_dir_all(parent).await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response();
    }
    match fs::rename(old, new).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}
