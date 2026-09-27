use crate::state::{AppState, repository_path, safe_segment};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
pub(crate) struct DeleteRequest {
    owner: String,
    repository: String,
}

pub(crate) async fn delete_repository(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<DeleteRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    if !safe_segment(&request.owner) || !safe_segment(&request.repository) {
        return StatusCode::UNPROCESSABLE_ENTITY.into_response();
    }
    let path = match repository_path(&state.repositories, &request.owner, &request.repository) {
        Ok(path) => path,
        Err(_) => return StatusCode::UNPROCESSABLE_ENTITY.into_response(),
    };
    match tokio::fs::remove_dir_all(path).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            StatusCode::NO_CONTENT.into_response()
        }
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}
