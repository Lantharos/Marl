use crate::{
    process::Command,
    state::{AppState, is_object_id, repository_path, safe_segment},
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
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveRequest {
    owner: String,
    repository: String,
    commit_id: String,
    format: String,
}

pub(crate) async fn repository_archive(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ArchiveRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match archive_inner(&state, request).await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("repository archive failed: {error:#}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}

async fn archive_inner(state: &AppState, request: ArchiveRequest) -> Result<Response> {
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !is_object_id(&request.commit_id)
        || !matches!(request.format.as_str(), "zip" | "tar.gz")
    {
        anyhow::bail!("invalid archive request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    crate::state::git_output(
        &repository,
        &[
            "cat-file",
            "-e",
            &format!("{}^{{commit}}", request.commit_id),
        ],
    )
    .await?;
    let prefix = format!("{}-{}/", request.repository, &request.commit_id[..12]);
    let mut child = Command::new("git")
        .args(["-C"])
        .arg(&repository)
        .arg("archive")
        .arg(format!("--format={}", request.format))
        .arg(format!("--prefix={prefix}"))
        .arg(&request.commit_id)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .context("start git archive")?;
    let stdout = child.stdout.take().context("open git archive output")?;
    tokio::spawn(async move {
        if let Ok(output) = child.wait_with_output().await
            && !output.status.success()
        {
            eprintln!(
                "git archive stream failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    });
    Ok(Response::builder()
        .header(
            "content-type",
            if request.format == "zip" {
                "application/zip"
            } else {
                "application/gzip"
            },
        )
        .header("cache-control", "private, no-store")
        .header("x-content-type-options", "nosniff")
        .body(Body::from_stream(ReaderStream::new(stdout)))?)
}
