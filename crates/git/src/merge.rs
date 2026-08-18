use crate::{
    merge_operations::{create_commit, merge_tree, rebase_commits},
    metadata::index_local_repository,
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
    pub(crate) source_branch: String,
    pub(crate) target_branch: String,
    pub(crate) source_commit_id: String,
    pub(crate) target_commit_id: String,
    pub(crate) title: String,
    pub(crate) author: String,
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
    let commit_id = match request.method {
        MergeMethod::Merge => {
            let tree = merge_tree(repository, &target, &source, None).await?;
            create_commit(
                repository,
                request,
                &tree,
                &[&target, &source],
                &request.title,
                None,
                true,
            )
            .await?
        }
        MergeMethod::Squash => {
            let tree = merge_tree(repository, &target, &source, None).await?;
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
        MergeMethod::Rebase => rebase_commits(repository, request, &target, &source).await?,
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
                "marl-merge-{}-{suffix}-{sequence}",
                std::process::id()
            ));
            if path.exists() {
                fs::remove_dir_all(&path).unwrap();
            }
            fs::create_dir_all(&path).unwrap();
            git(&path, &["init", "-b", "main"]);
            git(&path, &["config", "user.name", "Marl Test"]);
            git(&path, &["config", "user.email", "test@marl.sh"]);
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
    async fn retry_returns_the_same_merge_commit() {
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

        assert_ne!(first.commit_id, source);
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

    #[tokio::test]
    async fn squash_creates_one_commit_and_retries_idempotently() {
        let repository = TestRepository::new();
        let base = repository.oid("main");
        git(&repository.0, &["checkout", "-b", "feature"]);
        fs::write(repository.0.join("squash.txt"), "squashed\n").unwrap();
        git(&repository.0, &["add", "squash.txt"]);
        git(&repository.0, &["commit", "-m", "squash source"]);
        let source = repository.oid("feature");
        let mut request = merge_request_for(&source, &base, "pr_squash");
        request.method = MergeMethod::Squash;

        let first = perform_repository_merge(&repository.0, &request)
            .await
            .unwrap();
        let retry = perform_repository_merge(&repository.0, &request)
            .await
            .unwrap();

        assert_eq!(retry.commit_id, first.commit_id);
        assert_eq!(
            git_output_sync(
                &repository.0,
                &["rev-parse", &format!("{}^", first.commit_id)]
            ),
            base
        );
        assert_eq!(
            git_output_sync(
                &repository.0,
                &["rev-parse", &format!("{}^{{tree}}", first.commit_id)]
            ),
            git_output_sync(&repository.0, &["rev-parse", &format!("{source}^{{tree}}")])
        );
    }

    #[tokio::test]
    async fn rebase_replays_commits_and_retries_idempotently() {
        let repository = TestRepository::new();
        let base = repository.oid("main");
        git(&repository.0, &["checkout", "-b", "feature"]);
        fs::write(repository.0.join("rebase.txt"), "one\n").unwrap();
        git(&repository.0, &["add", "rebase.txt"]);
        git(&repository.0, &["commit", "-m", "rebase one"]);
        fs::write(repository.0.join("rebase.txt"), "one\ntwo\n").unwrap();
        git(&repository.0, &["commit", "-am", "rebase two"]);
        let source = repository.oid("feature");
        let mut request = merge_request_for(&source, &base, "pr_rebase");
        request.method = MergeMethod::Rebase;

        let first = perform_repository_merge(&repository.0, &request)
            .await
            .unwrap();
        let retry = perform_repository_merge(&repository.0, &request)
            .await
            .unwrap();

        assert_eq!(retry.commit_id, first.commit_id);
        assert_eq!(
            git_output_sync(
                &repository.0,
                &[
                    "rev-list",
                    "--count",
                    &format!("{base}..{}", first.commit_id)
                ]
            ),
            "2"
        );
        assert_eq!(
            git_output_sync(
                &repository.0,
                &["rev-parse", &format!("{}^{{tree}}", first.commit_id)]
            ),
            git_output_sync(&repository.0, &["rev-parse", &format!("{source}^{{tree}}")])
        );
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
            method: MergeMethod::Merge,
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
