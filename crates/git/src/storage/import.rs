use crate::{
    browse::{
        metadata::index_local_repository,
        repository_files::{ensure_bare_repository, repair_head},
    },
    process::Command,
    state::{AppState, repository_path, safe_ref, safe_segment},
};
use anyhow::{Result, bail};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportRequest {
    owner: String,
    repository: String,
    repository_id: String,
    actor_id: Option<String>,
    source: String,
    token: Option<String>,
    default_branch: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResponse {
    refs: usize,
}

pub(crate) async fn import_repository(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<ImportRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match import_inner(&state, request).await {
        Ok(response) => Json(response).into_response(),
        Err(error) => {
            eprintln!("repository import failed: {error:#}");
            (StatusCode::BAD_GATEWAY, error.to_string()).into_response()
        }
    }
}

fn github_source(value: &str) -> Option<String> {
    let path = value
        .strip_prefix("https://github.com/")?
        .trim_end_matches(".git");
    let (owner, repository) = path.split_once('/')?;
    (safe_segment(owner) && safe_segment(repository) && !repository.contains('/'))
        .then(|| format!("https://github.com/{owner}/{repository}.git"))
}

async fn import_inner(state: &AppState, request: ImportRequest) -> Result<ImportResponse> {
    let Some(source) = github_source(&request.source) else {
        bail!("only GitHub repositories can be imported")
    };
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !safe_ref(&format!("refs/heads/{}", request.default_branch))
    {
        bail!("invalid import request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    ensure_bare_repository(&repository).await?;
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(&repository)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .args([
            "-c",
            "credential.helper=",
            "fetch",
            "--quiet",
            "--no-auto-gc",
            &source,
            "+refs/heads/*:refs/heads/*",
            "+refs/tags/*:refs/tags/*",
            "+refs/pull/*/head:refs/marl/pulls/*/head",
        ]);
    if let Some(token) = request.token.as_deref().filter(|token| !token.is_empty()) {
        let credentials = STANDARD.encode(format!("x-access-token:{token}"));
        command
            .env("GIT_CONFIG_COUNT", "1")
            .env("GIT_CONFIG_KEY_0", "http.https://github.com/.extraHeader")
            .env(
                "GIT_CONFIG_VALUE_0",
                format!("Authorization: Basic {credentials}"),
            );
    }
    let output = command.output().await?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr);
        if message.contains("Authentication failed") || message.contains("could not read Username")
        {
            bail!("GitHub refused access to this repository. Check the access token.")
        }
        if message.contains("not found") {
            bail!("The GitHub repository was not found.")
        }
        bail!("The repository could not be fetched from GitHub.")
    }
    let head = format!("refs/heads/{}", request.default_branch);
    let _ = Command::new("git")
        .arg("-C")
        .arg(&repository)
        .args(["symbolic-ref", "HEAD", &head])
        .output()
        .await?;
    repair_head(&repository).await?;
    let refs =
        crate::state::git_output(&repository, &["for-each-ref", "--format=%(refname)"]).await?;
    if state.local_storage
        && let Err(error) = index_local_repository(
            state,
            request.repository_id,
            request.owner,
            request.repository,
            request.actor_id,
        )
        .await
    {
        eprintln!("local import indexing failed: {error:#}");
    }
    Ok(ImportResponse {
        refs: refs.lines().count(),
    })
}
