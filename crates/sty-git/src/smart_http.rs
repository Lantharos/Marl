use crate::{
    metadata::index_local_repository,
    state::{AppState, repository_path, safe_segment},
};
use anyhow::{Context, Result};
use axum::{
    body::Body,
    extract::{Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use bytes::{Bytes, BytesMut};
use futures_util::{StreamExt, TryStreamExt};
use serde::Deserialize;
use std::{path::Path, process::Stdio, sync::Arc};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};
use tokio_util::io::{ReaderStream, StreamReader};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Authorization {
    repository_id: String,
    write: bool,
}

#[derive(Debug)]
struct GitPath {
    owner: String,
    repository: String,
    path_info: String,
    service: String,
}

pub(crate) async fn git_request(State(state): State<Arc<AppState>>, request: Request) -> Response {
    match handle_git(state, request).await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("Git request failed: {error:#}");
            (StatusCode::INTERNAL_SERVER_ERROR, "Git gateway failed\n").into_response()
        }
    }
}

async fn handle_git(state: Arc<AppState>, request: Request) -> Result<Response> {
    let git_path = match parse_git_path(request.uri().path(), request.uri().query()) {
        Some(value) => value,
        None => return Ok((StatusCode::NOT_FOUND, "Repository not found\n").into_response()),
    };
    let authorization = match authorize(&state, request.headers(), &git_path).await? {
        Ok(value) => value,
        Err(status) => {
            let mut response = (status, "Git access denied\n").into_response();
            if status == StatusCode::UNAUTHORIZED {
                response.headers_mut().insert(
                    "www-authenticate",
                    HeaderValue::from_static("Basic realm=\"Sty\", charset=\"UTF-8\""),
                );
            }
            return Ok(response);
        }
    };
    if git_path.service == "git-receive-pack" && !authorization.write {
        return Ok((StatusCode::FORBIDDEN, "Push access denied\n").into_response());
    }
    let repository = repository_path(&state.repositories, &git_path.owner, &git_path.repository)?;
    ensure_bare_repository(&repository).await?;
    if git_path.service == "git-receive-pack" {
        let _ = fs::remove_file(repository.join("sty-generation")).await;
    }
    let (parts, body) = request.into_parts();
    let mut command = Command::new("git");
    command
        .arg("http-backend")
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap_or_default())
        .env("GIT_PROJECT_ROOT", &state.repositories)
        .env("GIT_HTTP_EXPORT_ALL", "1")
        .env("PATH_INFO", &git_path.path_info)
        .env("QUERY_STRING", parts.uri.query().unwrap_or_default())
        .env("REQUEST_METHOD", parts.method.as_str())
        .env("REMOTE_USER", "sty")
        .env("REMOTE_ADDR", "gateway")
        .env(
            "CONTENT_TYPE",
            parts
                .headers
                .get("content-type")
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default(),
        )
        .env(
            "CONTENT_LENGTH",
            parts
                .headers
                .get("content-length")
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default(),
        )
        .env(
            "HTTP_GIT_PROTOCOL",
            parts
                .headers
                .get("git-protocol")
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default(),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command.spawn().context("start git http-backend")?;
    let mut stdin = child.stdin.take().context("open Git stdin")?;
    let request_stream = body.into_data_stream().map_err(std::io::Error::other);
    tokio::spawn(async move {
        let mut reader = StreamReader::new(request_stream);
        let result = tokio::io::copy(&mut reader, &mut stdin).await;
        let _ = stdin.shutdown().await;
        result
    });
    let mut stdout = child.stdout.take().context("open Git stdout")?;
    let (status, headers, initial_body) = read_cgi_headers(&mut stdout).await?;
    if git_path.service == "git-receive-pack" {
        let mut response_body = initial_body.to_vec();
        stdout.read_to_end(&mut response_body).await?;
        let mut stderr = child.stderr.take().context("open Git stderr")?;
        let stderr_task = tokio::spawn(async move {
            let mut bytes = Vec::new();
            stderr.read_to_end(&mut bytes).await.map(|_| bytes)
        });
        let result = child.wait().await?;
        let stderr = stderr_task.await??;
        if !result.success() {
            anyhow::bail!(
                "git http-backend exited {result}: {}",
                String::from_utf8_lossy(&stderr)
            )
        }
        if state.local_storage
            && let Err(error) = index_local_repository(
                &state,
                authorization.repository_id.clone(),
                git_path.owner.clone(),
                git_path.repository.clone(),
            )
            .await
        {
            eprintln!("local Git push indexing failed: {error:#}");
        }
        let mut response = Response::new(Body::from(response_body));
        *response.status_mut() = status;
        *response.headers_mut() = headers;
        response.headers_mut().insert(
            "x-sty-repository",
            HeaderValue::from_str(&authorization.repository_id)?,
        );
        return Ok(response);
    }
    let stream =
        futures_util::stream::once(async move { Ok::<Bytes, std::io::Error>(initial_body) })
            .chain(ReaderStream::new(stdout));
    tokio::spawn(async move {
        if let Ok(result) = child.wait_with_output().await
            && !result.status.success()
        {
            eprintln!(
                "git http-backend exited {}: {}",
                result.status,
                String::from_utf8_lossy(&result.stderr)
            );
        }
    });
    let mut response = Response::new(Body::from_stream(stream));
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    response.headers_mut().insert(
        "x-sty-repository",
        HeaderValue::from_str(&authorization.repository_id)?,
    );
    Ok(response)
}

async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    path: &GitPath,
) -> Result<std::result::Result<Authorization, StatusCode>> {
    let response = state
        .client
        .get(format!("{}/api/v1/git/authorize", state.control_plane))
        .query(&[
            ("owner", &path.owner),
            ("repository", &path.repository),
            ("service", &path.service),
        ])
        .headers(forward_auth(headers))
        .send()
        .await
        .context("authorize Git request")?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Ok(Err(StatusCode::UNAUTHORIZED));
    }
    if response.status() == reqwest::StatusCode::FORBIDDEN {
        return Ok(Err(StatusCode::FORBIDDEN));
    }
    Ok(Ok(response
        .error_for_status()
        .context("control plane rejected Git request")?
        .json::<Authorization>()
        .await
        .context("decode Git authorization")?))
}

fn forward_auth(headers: &HeaderMap) -> reqwest::header::HeaderMap {
    let mut forwarded = reqwest::header::HeaderMap::new();
    if let Some(value) = headers.get("authorization") {
        forwarded.insert(reqwest::header::AUTHORIZATION, value.clone());
    }
    forwarded
}

fn parse_git_path(path: &str, query: Option<&str>) -> Option<GitPath> {
    let path = path.trim_start_matches('/');
    let (owner, rest) = path.split_once('/')?;
    let marker = ".git/";
    let index = rest.find(marker)?;
    let repository = &rest[..index];
    let suffix = &rest[index + marker.len()..];
    if !safe_segment(owner) || !safe_segment(repository) || repository.is_empty() {
        return None;
    }
    let service = if suffix == "git-receive-pack"
        || query
            .unwrap_or_default()
            .split('&')
            .any(|part| part == "service=git-receive-pack")
    {
        "git-receive-pack"
    } else {
        "git-upload-pack"
    };
    Some(GitPath {
        owner: owner.into(),
        repository: repository.into(),
        path_info: format!("/{owner}/{repository}.git/{suffix}"),
        service: service.into(),
    })
}

async fn ensure_bare_repository(path: &Path) -> Result<()> {
    if fs::try_exists(path.join("HEAD")).await? {
        return Ok(());
    }
    let parent = path.parent().context("repository parent")?;
    fs::create_dir_all(parent).await?;
    let output = Command::new("git")
        .args(["init", "--bare", "--initial-branch=main"])
        .arg(path)
        .output()
        .await
        .context("initialize bare repository")?;
    if !output.status.success() {
        anyhow::bail!(
            "git init failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let output = Command::new("git")
        .args(["-C"])
        .arg(path)
        .args(["config", "http.receivepack", "true"])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!("enable receive-pack failed")
    }
    Ok(())
}

async fn read_cgi_headers(
    stdout: &mut (impl tokio::io::AsyncRead + Unpin),
) -> Result<(StatusCode, HeaderMap, Bytes)> {
    let mut buffer = BytesMut::with_capacity(4096);
    let split;
    loop {
        if buffer.len() > 64 * 1024 {
            anyhow::bail!("CGI headers exceed 64 KiB")
        }
        let read = stdout.read_buf(&mut buffer).await?;
        if read == 0 {
            anyhow::bail!("git http-backend ended before CGI headers")
        }
        if let Some(index) = find_header_end(&buffer) {
            split = index;
            break;
        }
    }
    let header_bytes = buffer.split_to(split.0);
    let _separator = buffer.split_to(split.1);
    let text = std::str::from_utf8(&header_bytes).context("CGI headers are not UTF-8")?;
    let mut status = StatusCode::OK;
    let mut headers = HeaderMap::new();
    for line in text.lines() {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.eq_ignore_ascii_case("status") {
            if let Some(code) = value.trim().split(' ').next() {
                status = StatusCode::from_bytes(code.as_bytes())?;
            }
        } else {
            headers.append(
                HeaderName::from_bytes(name.trim().as_bytes())?,
                HeaderValue::from_str(value.trim())?,
            );
        }
    }
    Ok((status, headers, buffer.freeze()))
}

fn find_header_end(bytes: &[u8]) -> Option<(usize, usize)> {
    bytes
        .windows(4)
        .position(|value| value == b"\r\n\r\n")
        .map(|index| (index, 4))
        .or_else(|| {
            bytes
                .windows(2)
                .position(|value| value == b"\n\n")
                .map(|index| (index, 2))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_smart_git_paths() {
        let value = parse_git_path(
            "/lantharos/sty.git/info/refs",
            Some("service=git-receive-pack"),
        )
        .unwrap();
        assert_eq!(value.owner, "lantharos");
        assert_eq!(value.repository, "sty");
        assert_eq!(value.service, "git-receive-pack");
    }
    #[test]
    fn rejects_traversal_and_non_git_routes() {
        assert!(parse_git_path("/../sty.git/info/refs", None).is_none());
        assert!(parse_git_path("/lantharos/sty/info/refs", None).is_none());
    }
    #[test]
    fn recognizes_cgi_header_boundaries() {
        assert_eq!(
            find_header_end(b"Content-Type: x\r\n\r\nbody"),
            Some((15, 4))
        );
        assert_eq!(find_header_end(b"Status: 200\n\nbody"), Some((11, 2)));
    }
}
