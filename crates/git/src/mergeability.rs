use crate::{
    process::Command,
    state::{AppState, is_object_id, repository_path, safe_segment},
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
pub(crate) struct MergeabilityRequest {
    owner: String,
    repository: String,
    base: String,
    head: String,
}

pub(crate) async fn mergeability(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<MergeabilityRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !is_object_id(&request.base)
        || !is_object_id(&request.head)
    {
        return StatusCode::UNPROCESSABLE_ENTITY.into_response();
    }
    let Ok(repository) = repository_path(&state.repositories, &request.owner, &request.repository)
    else {
        return StatusCode::UNPROCESSABLE_ENTITY.into_response();
    };
    let result = Command::new("git")
        .arg("-C")
        .arg(repository)
        .args([
            "merge-tree",
            "--write-tree",
            "--quiet",
            &request.base,
            &request.head,
        ])
        .output()
        .await;
    match result {
        Ok(output) if matches!(output.status.code(), Some(0 | 1)) => {
            Json(serde_json::json!({"conflicted": !output.status.success()})).into_response()
        }
        _ => StatusCode::BAD_GATEWAY.into_response(),
    }
}
