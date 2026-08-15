use crate::state::{AppState, repository_path};
use anyhow::{Context, Result};
use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::TryStreamExt;
use std::{path::PathBuf, process::Stdio, sync::Arc};
use tokio::{fs, io::AsyncWriteExt, process::Command};
use tokio_util::io::{ReaderStream, StreamReader};

pub(crate) async fn status(
    State(state): State<Arc<AppState>>,
    Path((owner, repository)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    if !authorized(&state, &headers) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match repository_path(&state.repositories, &owner, &repository) {
        Ok(path) if fs::try_exists(path.join("HEAD")).await.unwrap_or(false) => {
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(_) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::BAD_REQUEST.into_response(),
    }
}

pub(crate) async fn restore(
    State(state): State<Arc<AppState>>,
    Path((owner, repository)): Path<(String, String)>,
    request: Request,
) -> Response {
    if !authorized(&state, request.headers()) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match restore_inner(state, owner, repository, request).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => {
            eprintln!("repository restore failed: {error:#}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Repository restore failed\n",
            )
                .into_response()
        }
    }
}

async fn restore_inner(
    state: Arc<AppState>,
    owner: String,
    repository: String,
    request: Request,
) -> Result<()> {
    let repository_path = repository_path(&state.repositories, &owner, &repository)?;
    if fs::try_exists(repository_path.join("HEAD")).await? {
        return Ok(());
    }
    fs::create_dir_all(&state.repositories).await?;
    let temporary = temporary_path(&state.repositories, &owner, &repository);
    let stream = request
        .into_body()
        .into_data_stream()
        .map_err(std::io::Error::other);
    let mut reader = StreamReader::new(stream);
    let mut file = fs::File::create(&temporary).await?;
    tokio::io::copy(&mut reader, &mut file).await?;
    file.flush().await?;
    drop(file);
    let output = Command::new("tar")
        .args(["--extract", "--zstd", "--file"])
        .arg(&temporary)
        .arg("--directory")
        .arg(&state.repositories)
        .output()
        .await
        .context("extract repository snapshot")?;
    let _ = fs::remove_file(&temporary).await;
    if !output.status.success() {
        anyhow::bail!(
            "tar restore failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    if !fs::try_exists(repository_path.join("HEAD")).await? {
        anyhow::bail!("snapshot did not contain the expected bare repository");
    }
    Ok(())
}

pub(crate) async fn export(
    State(state): State<Arc<AppState>>,
    Path((owner, repository)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    if !authorized(&state, &headers) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match export_inner(state, owner, repository).await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("repository export failed: {error:#}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Repository export failed\n",
            )
                .into_response()
        }
    }
}

async fn export_inner(state: Arc<AppState>, owner: String, repository: String) -> Result<Response> {
    let path = repository_path(&state.repositories, &owner, &repository)?;
    if !fs::try_exists(path.join("HEAD")).await? {
        return Ok(StatusCode::NOT_FOUND.into_response());
    }
    let archive_path = format!("{owner}/{repository}.git");
    let mut child = Command::new("tar")
        .args(["--create", "--zstd", "--file", "-", "--directory"])
        .arg(&state.repositories)
        .arg(archive_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .context("start repository snapshot")?;
    let stdout = child.stdout.take().context("snapshot stdout unavailable")?;
    tokio::spawn(async move {
        if let Ok(output) = child.wait_with_output().await
            && !output.status.success()
        {
            eprintln!(
                "repository snapshot failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
    });
    Ok(Response::builder()
        .header("content-type", "application/zstd")
        .body(Body::from_stream(ReaderStream::new(stdout)))?)
}

fn temporary_path(root: &std::path::Path, owner: &str, repository: &str) -> PathBuf {
    root.join(format!(
        ".{owner}-{repository}-restore-{}.tar.zst",
        std::process::id()
    ))
}

fn authorized(state: &AppState, headers: &HeaderMap) -> bool {
    headers
        .get("x-sty-snapshot-token")
        .and_then(|value| value.to_str().ok())
        == Some(state.gateway_token.as_str())
}
