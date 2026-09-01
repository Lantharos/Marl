use crate::process::Command;
use crate::repository_files::ensure_bare_repository;
use crate::state::{AppState, git_output, is_object_id, repository_path, safe_ref, safe_segment};
use anyhow::Result;
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Arc};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PinPullRequest {
    owner: String,
    repository: String,
    number: u64,
    source_commit_id: String,
    target_commit_id: String,
    expected_source_commit_id: Option<String>,
    expected_target_commit_id: Option<String>,
    source_owner: Option<String>,
    source_repository: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PinPullResponse {
    head_ref: String,
    base_ref: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TagListRequest {
    owner: String,
    repository: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateTagRequest {
    owner: String,
    repository: String,
    tag: String,
    target_commit_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Tag {
    name: String,
    object_id: String,
    target_commit_id: String,
    annotated: bool,
}

pub(crate) async fn list_tags(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TagListRequest>,
) -> Response {
    if !trusted(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match list_tags_inner(&state, request).await {
        Ok(tags) => (StatusCode::OK, Json(serde_json::json!({ "tags": tags }))).into_response(),
        Err(error) => {
            eprintln!("list tags failed: {error:#}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}

pub(crate) async fn create_tag(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<CreateTagRequest>,
) -> Response {
    if !trusted(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match create_tag_inner(&state, request).await {
        Ok(tag) => (StatusCode::OK, Json(tag)).into_response(),
        Err(error) if error.to_string().starts_with("tag conflict") => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "Tag already points to another commit." })),
        )
            .into_response(),
        Err(error) => {
            eprintln!("create tag failed: {error:#}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}

async fn list_tags_inner(state: &AppState, request: TagListRequest) -> Result<Vec<Tag>> {
    validate_repository(&request.owner, &request.repository)?;
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    ensure_bare_repository(&repository).await?;
    let output = Command::new("git")
        .args(["-C"])
        .arg(&repository)
        .args([
            "for-each-ref",
            "--sort=-creatordate",
            "--format=%(refname:strip=2)%00%(objectname)%00%(objecttype)%00%(*objectname)",
            "refs/tags",
        ])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "git for-each-ref failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
    String::from_utf8(output.stdout)?
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let mut fields = line.split('\0');
            let name = fields.next().unwrap_or_default();
            let object_id = fields.next().unwrap_or_default();
            let object_type = fields.next().unwrap_or_default();
            let peeled = fields.next().unwrap_or_default();
            if fields.next().is_some()
                || !safe_ref(&format!("refs/tags/{name}"))
                || !is_object_id(object_id)
                || (object_type == "tag" && !is_object_id(peeled))
                || !matches!(object_type, "commit" | "tag")
            {
                anyhow::bail!("repository returned an invalid tag")
            }
            Ok(Tag {
                name: name.to_owned(),
                object_id: object_id.to_owned(),
                target_commit_id: if object_type == "tag" {
                    peeled
                } else {
                    object_id
                }
                .to_owned(),
                annotated: object_type == "tag",
            })
        })
        .collect()
}

async fn create_tag_inner(state: &AppState, request: CreateTagRequest) -> Result<Tag> {
    validate_repository(&request.owner, &request.repository)?;
    let reference = format!("refs/tags/{}", request.tag);
    if request.tag.starts_with('-')
        || !safe_ref(&reference)
        || !is_object_id(&request.target_commit_id)
    {
        anyhow::bail!("invalid tag request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    verify_commit(&repository, &request.target_commit_id).await?;
    if let Ok(existing) = git_output(
        &repository,
        &["rev-parse", "--verify", &format!("{reference}^{{commit}}")],
    )
    .await
    {
        if existing.trim() != request.target_commit_id {
            anyhow::bail!("tag conflict")
        }
        let object_id = git_output(&repository, &["rev-parse", "--verify", &reference]).await?;
        return Ok(Tag {
            name: request.tag,
            object_id: object_id.trim().to_owned(),
            target_commit_id: request.target_commit_id,
            annotated: object_id.trim() != existing.trim(),
        });
    }
    let output = Command::new("git")
        .args(["-C"])
        .arg(&repository)
        .args([
            "update-ref",
            &reference,
            &request.target_commit_id,
            &"0".repeat(request.target_commit_id.len()),
        ])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!("tag conflict")
    }
    Ok(Tag {
        name: request.tag,
        object_id: request.target_commit_id.clone(),
        target_commit_id: request.target_commit_id,
        annotated: false,
    })
}

pub(crate) async fn pin_pull(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<PinPullRequest>,
) -> Response {
    if !trusted(&state, &headers) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match pin_pull_inner(&state, request).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) if error.to_string().starts_with("pull ref conflict") => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error":"Pull request refs already point to different commits."})),
        )
            .into_response(),
        Err(error) => {
            eprintln!("pin pull refs failed: {error:#}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}

fn trusted(state: &AppState, headers: &HeaderMap) -> bool {
    headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        == Some(state.gateway_token.as_str())
}

fn validate_repository(owner: &str, repository: &str) -> Result<()> {
    if !safe_segment(owner) || !safe_segment(repository) {
        anyhow::bail!("invalid repository")
    }
    Ok(())
}

async fn pin_pull_inner(state: &AppState, request: PinPullRequest) -> Result<PinPullResponse> {
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || request.number == 0
        || !is_object_id(&request.source_commit_id)
        || !is_object_id(&request.target_commit_id)
        || request
            .expected_source_commit_id
            .as_deref()
            .is_some_and(|value| !is_object_id(value))
        || request
            .expected_target_commit_id
            .as_deref()
            .is_some_and(|value| !is_object_id(value))
    {
        anyhow::bail!("invalid pull ref request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    crate::cross_repository::import_commit(
        state,
        &repository,
        request.source_owner.as_deref(),
        request.source_repository.as_deref(),
        &request.source_commit_id,
    )
    .await?;
    verify_commit(&repository, &request.source_commit_id).await?;
    verify_commit(&repository, &request.target_commit_id).await?;
    let prefix = format!("refs/marl/pulls/{}", request.number);
    let head_ref = format!("{prefix}/head");
    let base_ref = format!("{prefix}/base");
    ensure_ref(
        &repository,
        &head_ref,
        &request.source_commit_id,
        request.expected_source_commit_id.as_deref(),
    )
    .await?;
    ensure_ref(
        &repository,
        &base_ref,
        &request.target_commit_id,
        request.expected_target_commit_id.as_deref(),
    )
    .await?;
    ensure_ref(
        &repository,
        &format!("{prefix}/heads/{}", request.source_commit_id),
        &request.source_commit_id,
        None,
    )
    .await?;
    ensure_ref(
        &repository,
        &format!("{prefix}/bases/{}", request.target_commit_id),
        &request.target_commit_id,
        None,
    )
    .await?;
    Ok(PinPullResponse { head_ref, base_ref })
}

async fn verify_commit(repository: &Path, object_id: &str) -> Result<()> {
    git_output(
        repository,
        &["cat-file", "-e", &format!("{object_id}^{{commit}}")],
    )
    .await?;
    Ok(())
}

async fn ensure_ref(
    repository: &Path,
    name: &str,
    object_id: &str,
    expected_object_id: Option<&str>,
) -> Result<()> {
    let existing = git_output(repository, &["rev-parse", "--verify", "--quiet", name]).await;
    match existing {
        Ok(value) if value.trim() == object_id => return Ok(()),
        Ok(value) if expected_object_id.is_some_and(|expected| value.trim() == expected) => {}
        Ok(_) => anyhow::bail!("pull ref conflict"),
        Err(_) => {}
    }
    let expected = expected_object_id
        .map(str::to_owned)
        .unwrap_or_else(|| "0".repeat(object_id.len()));
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["update-ref", name, object_id, &expected])
        .output()
        .await?;
    if !output.status.success() {
        let recovered = git_output(repository, &["rev-parse", "--verify", "--quiet", name]).await?;
        if recovered.trim() != object_id {
            anyhow::bail!("pull ref conflict")
        }
    }
    Ok(())
}
