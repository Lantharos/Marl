use crate::{
    metadata::index_local_repository,
    state::{AppState, git_output, is_object_id, repository_path, safe_ref, safe_segment},
};
use anyhow::{Context, Result};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Arc};
use tokio::process::Command;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MergeRequest {
    repository_id: String,
    owner: String,
    repository: String,
    source_branch: String,
    target_branch: String,
    source_commit_id: String,
    target_commit_id: String,
    title: String,
    author: String,
    operation_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MergeResponse {
    commit_id: String,
    target_head_id: String,
}

pub(crate) async fn merge_request(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<MergeRequest>,
) -> Response {
    if headers
        .get("x-sty-gateway-token")
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
        || !safe_ref(&request.source_branch)
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
    let value = perform_repository_merge(&repository, &request).await?;
    if state.local_storage
        && let Err(error) = index_local_repository(
            state,
            request.repository_id,
            request.owner,
            request.repository,
        )
        .await
    {
        eprintln!("local merge indexing failed: {error:#}");
    }
    Ok(value)
}

async fn perform_repository_merge(
    repository: &Path,
    request: &MergeRequest,
) -> Result<MergeResponse> {
    let source_ref = format!("refs/heads/{}", request.source_branch);
    let target_ref = format!("refs/heads/{}", request.target_branch);
    let source = git_output(repository, &["rev-parse", &source_ref])
        .await?
        .trim()
        .to_owned();
    let target = git_output(repository, &["rev-parse", &target_ref])
        .await?
        .trim()
        .to_owned();
    if let Some(commit_id) = completed_operation(repository, request, &target).await? {
        return Ok(MergeResponse {
            commit_id,
            target_head_id: target,
        });
    }
    if source != request.source_commit_id || target != request.target_commit_id {
        anyhow::bail!("stale branch head")
    }
    let ancestor = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["merge-base", "--is-ancestor", &target, &source])
        .status()
        .await?;
    let commit_id = if ancestor.success() {
        source.clone()
    } else {
        let merge_tree = Command::new("git")
            .args(["-C"])
            .arg(repository)
            .args(["merge-tree", "--write-tree", &target, &source])
            .output()
            .await?;
        if !merge_tree.status.success() {
            anyhow::bail!(
                "merge conflict: {}",
                String::from_utf8_lossy(&merge_tree.stdout)
            );
        }
        let tree = String::from_utf8(merge_tree.stdout)?
            .lines()
            .next()
            .context("merge-tree did not return a tree")?
            .trim()
            .to_owned();
        let message = format!(
            "{}\n\nSty-Merge-Operation: {}",
            request.title, request.operation_id
        );
        let output = Command::new("git")
            .args(["-C"])
            .arg(repository)
            .args([
                "commit-tree",
                &tree,
                "-p",
                &target,
                "-p",
                &source,
                "-m",
                &message,
            ])
            .env("GIT_AUTHOR_NAME", &request.author)
            .env(
                "GIT_AUTHOR_EMAIL",
                format!("{}@users.sty.sh", request.author),
            )
            .env("GIT_COMMITTER_NAME", &request.author)
            .env(
                "GIT_COMMITTER_EMAIL",
                format!("{}@users.sty.sh", request.author),
            )
            .output()
            .await?;
        if !output.status.success() {
            anyhow::bail!(
                "commit-tree failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        String::from_utf8(output.stdout)?.trim().to_owned()
    };
    let update = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["update-ref", &target_ref, &commit_id, &target])
        .output()
        .await?;
    if !update.status.success() {
        anyhow::bail!("stale branch head")
    }
    Ok(MergeResponse {
        target_head_id: commit_id.clone(),
        commit_id,
    })
}

async fn completed_operation(
    repository: &Path,
    request: &MergeRequest,
    target: &str,
) -> Result<Option<String>> {
    if is_ancestor(
        repository,
        &request.target_commit_id,
        &request.source_commit_id,
    )
    .await?
        && is_ancestor(repository, &request.source_commit_id, target).await?
    {
        return Ok(Some(request.source_commit_id.clone()));
    }
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
    let trailer = format!("Sty-Merge-Operation: {}", request.operation_id);
    for commit in candidates.lines() {
        let metadata = git_output(repository, &["show", "-s", "--format=%P%n%B", commit]).await?;
        let mut lines = metadata.lines();
        let parents = lines
            .next()
            .unwrap_or_default()
            .split_whitespace()
            .collect::<Vec<_>>();
        if parents
            == [
                request.target_commit_id.as_str(),
                request.source_commit_id.as_str(),
            ]
            && lines.any(|line| line.trim() == trailer)
        {
            return Ok(Some(commit.to_owned()));
        }
    }
    Ok(None)
}

async fn is_ancestor(repository: &Path, ancestor: &str, descendant: &str) -> Result<bool> {
    let status = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["merge-base", "--is-ancestor", ancestor, descendant])
        .status()
        .await?;
    Ok(status.success())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        process::Command as StdCommand,
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    static NEXT_REPOSITORY: AtomicU64 = AtomicU64::new(0);

    struct TestRepository(std::path::PathBuf);

    impl TestRepository {
        fn new() -> Self {
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let sequence = NEXT_REPOSITORY.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "sty-merge-{}-{suffix}-{sequence}",
                std::process::id()
            ));
            if path.exists() {
                fs::remove_dir_all(&path).unwrap();
            }
            fs::create_dir_all(&path).unwrap();
            git(&path, &["init", "-b", "main"]);
            git(&path, &["config", "user.name", "Sty Test"]);
            git(&path, &["config", "user.email", "test@sty.sh"]);
            git(&path, &["config", "commit.gpgSign", "false"]);
            fs::write(path.join("file.txt"), "base\n").unwrap();
            git(&path, &["add", "file.txt"]);
            git(&path, &["commit", "-m", "base"]);
            Self(path)
        }

        fn oid(&self, revision: &str) -> String {
            git_output_sync(&self.0, &["rev-parse", revision])
        }
    }

    impl Drop for TestRepository {
        fn drop(&mut self) {
            if self.0.starts_with(std::env::temp_dir()) {
                fs::remove_dir_all(&self.0).unwrap();
            }
        }
    }

    #[tokio::test]
    async fn retry_returns_the_same_fast_forward() {
        let repository = TestRepository::new();
        let base = repository.oid("main");
        git(&repository.0, &["checkout", "-b", "feature"]);
        fs::write(repository.0.join("file.txt"), "feature\n").unwrap();
        git(&repository.0, &["commit", "-am", "feature"]);
        let source = repository.oid("feature");
        let request = merge_request_for(&source, &base, "pr_fast_forward");

        let first = perform_repository_merge(&repository.0, &request)
            .await
            .unwrap();
        let second = perform_repository_merge(&repository.0, &request)
            .await
            .unwrap();

        assert_eq!(first.commit_id, source);
        assert_eq!(second.commit_id, first.commit_id);
        assert_eq!(second.target_head_id, first.target_head_id);
    }

    #[tokio::test]
    async fn retry_finds_the_original_merge_after_target_advances() {
        let repository = TestRepository::new();
        git(&repository.0, &["checkout", "-b", "feature"]);
        fs::write(repository.0.join("feature.txt"), "feature\n").unwrap();
        git(&repository.0, &["add", "feature.txt"]);
        git(&repository.0, &["commit", "-m", "feature"]);
        let source = repository.oid("feature");
        git(&repository.0, &["checkout", "main"]);
        fs::write(repository.0.join("main.txt"), "main\n").unwrap();
        git(&repository.0, &["add", "main.txt"]);
        git(&repository.0, &["commit", "-m", "main"]);
        let target = repository.oid("main");
        let request = merge_request_for(&source, &target, "pr_merge_commit");
        let first = perform_repository_merge(&repository.0, &request)
            .await
            .unwrap();
        fs::write(repository.0.join("later.txt"), "later\n").unwrap();
        git(&repository.0, &["add", "later.txt"]);
        git(&repository.0, &["commit", "-m", "later"]);
        let advanced = repository.oid("main");

        let recovered = perform_repository_merge(&repository.0, &request)
            .await
            .unwrap();

        assert_eq!(recovered.commit_id, first.commit_id);
        assert_eq!(recovered.target_head_id, advanced);
    }

    fn merge_request_for(source: &str, target: &str, operation_id: &str) -> MergeRequest {
        MergeRequest {
            repository_id: "repo_test".into(),
            owner: "owner".into(),
            repository: "repository".into(),
            source_branch: "feature".into(),
            target_branch: "main".into(),
            source_commit_id: source.into(),
            target_commit_id: target.into(),
            title: "Merge test".into(),
            author: "tester".into(),
            operation_id: operation_id.into(),
        }
    }

    fn git(repository: &Path, arguments: &[&str]) {
        let output = StdCommand::new("git")
            .arg("-C")
            .arg(repository)
            .args(arguments)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn git_output_sync(repository: &Path, arguments: &[&str]) -> String {
        let output = StdCommand::new("git")
            .arg("-C")
            .arg(repository)
            .args(arguments)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).unwrap().trim().to_owned()
    }
}
