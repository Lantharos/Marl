use crate::process::Command;
use crate::state::{AppState, is_object_id, repository_path, safe_segment};
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

const MAX_BLOB_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BlobRequest {
    owner: String,
    repository: String,
    object_id: String,
}

pub(crate) async fn read_blob(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<BlobRequest>,
) -> Response {
    if headers
        .get("x-sty-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !is_object_id(&request.object_id)
    {
        return (StatusCode::UNPROCESSABLE_ENTITY, "Invalid Git blob.\n").into_response();
    }
    let repository = match repository_path(&state.repositories, &request.owner, &request.repository)
    {
        Ok(value) => value,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let size = match Command::new("git")
        .args(["-C"])
        .arg(&repository)
        .args(["cat-file", "-s", &request.object_id])
        .output()
        .await
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
    {
        Some(value) if value <= MAX_BLOB_BYTES => value,
        Some(_) => {
            return (StatusCode::PAYLOAD_TOO_LARGE, "Git blob is too large.\n").into_response();
        }
        None => return StatusCode::NOT_FOUND.into_response(),
    };
    let mut child = match Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["cat-file", "blob", &request.object_id])
        .stdout(Stdio::piped())
        .spawn()
    {
        Ok(value) => value,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let Some(stdout) = child.stdout.take() else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    tokio::spawn(async move {
        let _ = child.wait().await;
    });
    Response::builder()
        .header("content-type", "application/octet-stream")
        .header("content-length", size)
        .body(Body::from_stream(ReaderStream::new(stdout)))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}
