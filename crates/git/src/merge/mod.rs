pub(crate) mod mergeability;
pub(crate) mod operations;

use crate::{
    browse::metadata::index_local_repository,
    merge::operations::{create_commit, merge_tree, rebase_commits},
    process::Command,
    state::{AppState, git_output, is_object_id, repository_path, safe_ref, safe_segment},
};
use anyhow::Result;
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Arc};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MergeRequest {
    pub(crate) repository_id: String,
    pub(crate) owner: String,
    pub(crate) repository: String,
    pub(crate) target_branch: String,
    pub(crate) source_commit_id: String,
    pub(crate) target_commit_id: String,
    pub(crate) title: String,
    pub(crate) author: String,
    pub(crate) author_email: String,
    pub(crate) actor_id: String,
    pub(crate) operation_id: String,
    #[serde(default)]
    method: MergeMethod,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
enum MergeMethod {
    #[default]
    Merge,
    Squash,
    Rebase,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MergeResponse {
    commit_id: String,
    target_head_id: String,
}

struct MergePlan {
    result: MergeResponse,
    update: Option<(String, String)>,
}

pub(crate) async fn merge_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<MergeRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error":"Gateway authentication failed."})),
        )
            .into_response();
    }
    match perform_merge(&state, request).await {
        Ok(value) => (StatusCode::OK, Json(value)).into_response(),
        Err(error) if error.to_string().starts_with("Signing firewall") => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error": format!("{error} Create and sign the merge locally, then push it.")})),
        ).into_response(),
        Err(error) if error.to_string().starts_with("merge conflict") => {
            (
                StatusCode::CONFLICT,
                Json(serde_json::json!({"error":"Branches contain merge conflicts."})),
            )
                .into_response()
        }
        Err(error) if error.to_string().starts_with("stale branch head") => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error":"A branch changed before this merge could be published."})),
        )
            .into_response(),
        Err(error) => {
            eprintln!("merge failed: {error:#}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error":"Git merge failed."})),
            )
                .into_response()
        }
    }
}

async fn perform_merge(state: &AppState, request: MergeRequest) -> Result<MergeResponse> {
    if !request.repository_id.starts_with("repo_")
        || !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !safe_ref(&request.target_branch)
        || !is_object_id(&request.source_commit_id)
        || !is_object_id(&request.target_commit_id)
        || !request.operation_id.starts_with("pr_")
        || !request
            .operation_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '_')
    {
        anyhow::bail!("invalid merge request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    let plan = prepare_repository_merge(&repository, &request).await?;
    if plan.update.is_some() {
        let history = git_output(
            &repository,
            &[
                "--no-replace-objects",
                "rev-list",
                &plan.result.commit_id,
                "--not",
                "--all",
            ],
        )
        .await?;
        let commits = history.lines().map(str::to_owned).collect::<Vec<_>>();
        crate::signing::signatures::enforce_commits(
            state,
            &request.repository_id,
            &repository,
            &commits,
        )
        .await?;
    }
    let value = publish_merge(&repository, plan).await?;
    if state.local_storage
        && let Err(error) = index_local_repository(
            state,
            request.repository_id,
            request.owner,
            request.repository,
            Some(request.actor_id),
        )
        .await
    {
        eprintln!("local merge indexing failed: {error:#}");
    }
    Ok(value)
}

async fn prepare_repository_merge(repository: &Path, request: &MergeRequest) -> Result<MergePlan> {
    let target_ref = format!("refs/heads/{}", request.target_branch);
    let source = request.source_commit_id.as_str();
    git_output(
        repository,
        &["cat-file", "-e", &format!("{source}^{{commit}}")],
    )
    .await?;
    let target = git_output(repository, &["rev-parse", &target_ref])
        .await?
        .trim()
        .to_owned();
    if let Some(commit_id) = completed_operation(repository, request, &target).await? {
        return Ok(MergePlan {
            result: MergeResponse {
                commit_id,
                target_head_id: target,
            },
            update: None,
        });
    }
    if target != request.target_commit_id {
        anyhow::bail!("stale branch head")
    }
    let commit_id = match request.method {
        MergeMethod::Merge => {
            let tree = merge_tree(repository, &target, source, None).await?;
            create_commit(
                repository,
                request,
                &tree,
                &[&target, source],
                &request.title,
                None,
                true,
            )
            .await?
        }
        MergeMethod::Squash => {
            let tree = merge_tree(repository, &target, source, None).await?;
            create_commit(
                repository,
                request,
                &tree,
                &[&target],
                &request.title,
                None,
                true,
            )
            .await?
        }
        MergeMethod::Rebase => rebase_commits(repository, request, &target, source).await?,
    };
    Ok(MergePlan {
        result: MergeResponse {
            target_head_id: commit_id.clone(),
            commit_id,
        },
        update: Some((target_ref, target)),
    })
}

async fn publish_merge(repository: &Path, plan: MergePlan) -> Result<MergeResponse> {
    let Some((target_ref, target)) = plan.update else {
        return Ok(plan.result);
    };
    let update = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["update-ref", &target_ref, &plan.result.commit_id, &target])
        .output()
        .await?;
    if !update.status.success() {
        anyhow::bail!("stale branch head")
    }
    Ok(plan.result)
}

async fn completed_operation(
    repository: &Path,
    request: &MergeRequest,
    target: &str,
) -> Result<Option<String>> {
    let candidates = git_output(
        repository,
        &[
            "rev-list",
            "--first-parent",
            target,
            "--not",
            &request.target_commit_id,
        ],
    )
    .await?;
    let trailer = format!("Marl-Merge-Operation: {}", request.operation_id);
    for commit in candidates.lines() {
        let metadata = git_output(repository, &["show", "-s", "--format=%P%n%B", commit]).await?;
        let mut lines = metadata.lines();
        let parents = lines
            .next()
            .unwrap_or_default()
            .split_whitespace()
            .collect::<Vec<_>>();
        if !lines.any(|line| line.trim() == trailer) {
            continue;
        }
        let expected_parents = match request.method {
            MergeMethod::Merge => vec![
                request.target_commit_id.as_str(),
                request.source_commit_id.as_str(),
            ],
            MergeMethod::Squash => vec![request.target_commit_id.as_str()],
            MergeMethod::Rebase => parents.clone(),
        };
        if parents == expected_parents {
            return Ok(Some(commit.to_owned()));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests;
