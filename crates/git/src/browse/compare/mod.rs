use crate::state::{
    AppState, git_output, is_object_id, repository_path, safe_repository_path, safe_segment,
};
use anyhow::Result;
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

mod diff;

use diff::{ComparedFile, diff_files};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompareRequest {
    owner: String,
    repository: String,
    base: String,
    head: String,
    source_owner: Option<String>,
    source_repository: Option<String>,
    #[serde(default)]
    direct: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommitRequest {
    owner: String,
    repository: String,
    commit_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PatchRequest {
    owner: String,
    repository: String,
    base: String,
    head: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompareResponse {
    base: String,
    head: String,
    merge_base: String,
    files: Vec<ComparedFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommitResponse {
    id: String,
    parents: Vec<String>,
    title: String,
    body: String,
    author: String,
    author_email: String,
    authored_at: String,
    signature_status: String,
    files: Vec<ComparedFile>,
}

#[derive(Debug, Serialize)]
struct PatchResponse {
    patch: String,
}

fn trusted(headers: &HeaderMap, state: &AppState) -> bool {
    headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        == Some(state.gateway_token.as_str())
}

pub(crate) async fn compare_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CompareRequest>,
) -> Response {
    if !trusted(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match perform_compare(&state, request).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => {
            eprintln!("compare failed: {error:#}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error":"Git comparison failed."})),
            )
                .into_response()
        }
    }
}

pub(crate) async fn commit_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CommitRequest>,
) -> Response {
    if !trusted(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match perform_commit(&state, request).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => {
            eprintln!("commit read failed: {error:#}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error":"Git commit could not be read."})),
            )
                .into_response()
        }
    }
}

pub(crate) async fn patch_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<PatchRequest>,
) -> Response {
    if !trusted(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match perform_patch(&state, request).await {
        Ok(patch) => Json(PatchResponse { patch }).into_response(),
        Err(error) => {
            eprintln!("patch read failed: {error:#}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}

async fn perform_patch(state: &AppState, request: PatchRequest) -> Result<String> {
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !is_object_id(&request.base)
        || !is_object_id(&request.head)
        || !safe_repository_path(&request.path)
    {
        anyhow::bail!("invalid patch request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    git_output(
        &repository,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--unified=3",
            &format!("{}..{}", request.base, request.head),
            "--",
            &request.path,
        ],
    )
    .await
}

async fn perform_compare(state: &AppState, request: CompareRequest) -> Result<CompareResponse> {
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !is_object_id(&request.base)
        || !is_object_id(&request.head)
    {
        anyhow::bail!("invalid comparison")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    crate::storage::cross_repository::import_commit(
        state,
        &repository,
        request.source_owner.as_deref(),
        request.source_repository.as_deref(),
        &request.head,
    )
    .await?;
    let merge_base = if request.direct {
        request.base.clone()
    } else {
        git_output(&repository, &["merge-base", &request.base, &request.head])
            .await?
            .trim()
            .to_owned()
    };
    let files = diff_files(&repository, &format!("{merge_base}..{}", request.head)).await?;
    Ok(CompareResponse {
        base: request.base,
        head: request.head,
        merge_base,
        files,
    })
}

async fn perform_commit(state: &AppState, request: CommitRequest) -> Result<CommitResponse> {
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !is_object_id(&request.commit_id)
    {
        anyhow::bail!("invalid commit request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    let metadata = git_output(
        &repository,
        &[
            "show",
            "-s",
            "--date=iso-strict",
            "--format=%H%x00%P%x00%s%x00%b%x00%an%x00%ae%x00%aI",
            &request.commit_id,
        ],
    )
    .await?;
    let fields = metadata.trim_end().split('\0').collect::<Vec<_>>();
    if fields.len() != 7 {
        anyhow::bail!("invalid commit metadata")
    }
    let parents = fields[1]
        .split_whitespace()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let base = parents
        .first()
        .map(String::as_str)
        .unwrap_or("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
    let files = diff_files(&repository, &format!("{base}..{}", request.commit_id)).await?;
    Ok(CommitResponse {
        id: fields[0].into(),
        parents,
        title: fields[2].into(),
        body: fields[3].trim().into(),
        author: fields[4].into(),
        author_email: fields[5].into(),
        authored_at: fields[6].trim().into(),
        signature_status: "unverified".into(),
        files,
    })
}

#[cfg(test)]
mod tests;
