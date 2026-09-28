use super::*;

async fn perform_repository_merge(
    repository: &Path,
    request: &MergeRequest,
) -> Result<MergeResponse> {
    publish_merge(
        repository,
        prepare_repository_merge(repository, request).await?,
    )
    .await
}
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
        target_branch: "main".into(),
        source_commit_id: source.into(),
        target_commit_id: target.into(),
        title: "Merge test".into(),
        author: "tester".into(),
        author_email: "tester@example.com".into(),
        actor_id: "tester".into(),
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
