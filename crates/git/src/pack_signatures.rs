use crate::{
    pack_graph::PackObject,
    process::Command,
    signatures::{POLICY_BATCH, SignatureVerifier, SigningPolicy, read_commit_identities},
    state::{AppState, is_object_id},
};
use anyhow::{Context, Result, bail};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use std::{collections::HashSet, path::PathBuf, sync::Arc};
use tokio::fs;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScanRequest {
    existing_packs: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CheckRequest {
    commits: Vec<String>,
    policy: SigningPolicy,
}

pub(crate) async fn scan(
    State(state): State<Arc<AppState>>,
    Path((push, pack)): Path<(String, String)>,
    headers: HeaderMap,
    Json(request): Json<ScanRequest>,
) -> Response {
    response(scan_inner(&state, &push, &pack, &headers, request).await)
}

async fn scan_inner(
    state: &AppState,
    push: &str,
    pack: &str,
    headers: &HeaderMap,
    request: ScanRequest,
) -> Result<Response> {
    let directory = signing_directory(state, push, pack, headers)?;
    let objects: Vec<PackObject> =
        serde_json::from_slice(&fs::read(directory.join("objects.json")).await?)?;
    let mut existing = HashSet::new();
    for id in request.existing_packs {
        if !is_object_id(&id) {
            bail!("invalid existing pack id");
        }
        let index = fs::File::open(
            directory
                .parent()
                .context("missing session directory")?
                .join("known")
                .join(format!("{id}.idx")),
        )
        .await?;
        let output = Command::new("git")
            .arg("show-index")
            .stdin(index.into_std().await)
            .output()
            .await?;
        if !output.status.success() {
            bail!("existing pack index is invalid");
        }
        existing.extend(
            String::from_utf8(output.stdout)?
                .lines()
                .filter_map(|line| line.split_whitespace().nth(1))
                .map(str::to_owned),
        );
    }
    let ids = objects
        .iter()
        .filter(|object| object.kind == "commit" && !existing.contains(&object.id))
        .map(|object| object.id.clone())
        .collect::<Vec<_>>();
    let mut commits = Vec::new();
    for batch in ids.chunks(POLICY_BATCH) {
        commits.extend(read_commit_identities(&directory.join("repository.git"), batch).await?);
    }
    Ok(Json(commits).into_response())
}

pub(crate) async fn check(
    State(state): State<Arc<AppState>>,
    Path((push, pack)): Path<(String, String)>,
    headers: HeaderMap,
    Json(request): Json<CheckRequest>,
) -> Response {
    response(check_inner(&state, &push, &pack, &headers, request).await)
}

async fn check_inner(
    state: &AppState,
    push: &str,
    pack: &str,
    headers: &HeaderMap,
    request: CheckRequest,
) -> Result<Response> {
    let directory = signing_directory(state, push, pack, headers)?.join("repository.git");
    if request.commits.len() > POLICY_BATCH {
        bail!("too many commits in signature verification batch");
    }
    let commits = read_commit_identities(&directory, &request.commits).await?;
    SignatureVerifier::new(request.policy)
        .enforce(&directory, &commits)
        .await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

fn signing_directory(
    state: &AppState,
    push: &str,
    pack: &str,
    headers: &HeaderMap,
) -> Result<PathBuf> {
    if headers
        .get("x-marl-storage-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        bail!("storage route not found");
    }
    crate::pack::validate_session_part(push)?;
    crate::pack::validate_session_part(pack)?;
    Ok(crate::pack::session_path(state, push)?.join(pack))
}

fn response(result: Result<Response>) -> Response {
    match result {
        Ok(response) => response,
        Err(error) => (StatusCode::UNPROCESSABLE_ENTITY, error.to_string()).into_response(),
    }
}
