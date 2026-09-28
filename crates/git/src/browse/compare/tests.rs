use super::*;
use crate::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[tokio::test]
async fn reads_commit_metadata_and_patch() {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!("marl-git-commit-{suffix}"));
    let repository = root.join("lantharos").join("marl.git");
    std::fs::create_dir_all(repository.parent().unwrap()).unwrap();
    assert!(
        Command::new("git")
            .args(["init", "--initial-branch=main"])
            .arg(&repository)
            .status()
            .await
            .unwrap()
            .success()
    );
    std::fs::write(repository.join("README.md"), "hello\n").unwrap();
    assert!(
        Command::new("git")
            .args(["-C"])
            .arg(&repository)
            .args(["add", "README.md"])
            .status()
            .await
            .unwrap()
            .success()
    );
    assert!(
        Command::new("git")
            .args(["-C"])
            .arg(&repository)
            .args([
                "-c",
                "user.name=Marl Test",
                "-c",
                "user.email=marl@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-m",
                "Initial commit"
            ])
            .status()
            .await
            .unwrap()
            .success()
    );
    let commit_id = git_output(&repository, &["rev-parse", "HEAD"])
        .await
        .unwrap()
        .trim()
        .to_owned();
    let state = AppState {
        repositories: root.clone(),
        control_plane: String::new(),
        client: reqwest::Client::new(),
        gateway_token: String::new(),
        local_storage: false,
        git_edge: None,
        repository_locks: std::sync::Mutex::new(std::collections::HashMap::new()),
    };
    let commit = perform_commit(
        &state,
        CommitRequest {
            owner: "lantharos".into(),
            repository: "marl".into(),
            commit_id: commit_id.clone(),
        },
    )
    .await
    .unwrap();
    assert_eq!(commit.title, "Initial commit");
    assert_eq!(commit.files.len(), 1);
    assert_eq!(commit.files[0].path, "README.md");
    assert_eq!(commit.files[0].patch_omitted.as_deref(), Some("lazy"));
    assert!(commit.files[0].patch.is_empty());

    std::fs::remove_file(repository.join("README.md")).unwrap();
    std::fs::write(
        repository.join("large.txt"),
        (0..1_001)
            .map(|line| format!("line {line}\n"))
            .collect::<String>(),
    )
    .unwrap();
    assert!(
        Command::new("git")
            .args(["-C"])
            .arg(&repository)
            .args(["add", "--all"])
            .status()
            .await
            .unwrap()
            .success()
    );
    assert!(
        Command::new("git")
            .args(["-C"])
            .arg(&repository)
            .args([
                "-c",
                "user.name=Marl Test",
                "-c",
                "user.email=marl@example.invalid",
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-m",
                "Large change"
            ])
            .status()
            .await
            .unwrap()
            .success()
    );
    let head = git_output(&repository, &["rev-parse", "HEAD"])
        .await
        .unwrap()
        .trim()
        .to_owned();
    let files = diff_files(&repository, &format!("{commit_id}..{head}"))
        .await
        .unwrap();
    let deleted = files.iter().find(|file| file.path == "README.md").unwrap();
    let large = files.iter().find(|file| file.path == "large.txt").unwrap();
    assert_eq!(deleted.patch_omitted.as_deref(), Some("deleted"));
    assert!(deleted.patch.is_empty());
    assert_eq!(large.patch_omitted.as_deref(), Some("large"));
    assert!(large.patch.is_empty());
    let loaded = perform_patch(
        &state,
        PatchRequest {
            owner: "lantharos".into(),
            repository: "marl".into(),
            base: commit_id,
            head,
            path: "large.txt".into(),
        },
    )
    .await
    .unwrap();
    assert!(loaded.contains("+line 1000"));
    std::fs::remove_dir_all(root).unwrap();
}
