use crate::process::Command;
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
use std::{collections::HashMap, path::Path, sync::Arc};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompareRequest {
    owner: String,
    repository: String,
    base: String,
    head: String,
    source_owner: Option<String>,
    source_repository: Option<String>,
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
#[serde(rename_all = "camelCase")]
struct ComparedFile {
    path: String,
    old_path: Option<String>,
    status: String,
    additions: usize,
    deletions: usize,
    patch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    patch_omitted: Option<String>,
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
    crate::cross_repository::import_commit(
        state,
        &repository,
        request.source_owner.as_deref(),
        request.source_repository.as_deref(),
        &request.head,
    )
    .await?;
    let merge_base = git_output(&repository, &["merge-base", &request.base, &request.head])
        .await?
        .trim()
        .to_owned();
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

async fn diff_files(repository: &Path, range: &str) -> Result<Vec<ComparedFile>> {
    let stats = diff_stats(repository, range).await?;
    let names = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["diff", "--name-status", "-z", "--find-renames", range])
        .output()
        .await?;
    if !names.status.success() {
        anyhow::bail!("git diff names failed")
    }
    let records = names
        .stdout
        .split(|byte| *byte == 0)
        .filter(|value| !value.is_empty())
        .map(|value| String::from_utf8_lossy(value).into_owned())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;
    while index < records.len() {
        let status_code = records[index].clone();
        index += 1;
        if index >= records.len() {
            break;
        }
        let first_path = records[index].clone();
        index += 1;
        let (old_path, path, status) = if status_code.starts_with('R') {
            if index >= records.len() {
                break;
            }
            let new_path = records[index].clone();
            index += 1;
            (Some(first_path), new_path, "renamed")
        } else {
            (
                None,
                first_path,
                match status_code.as_bytes().first() {
                    Some(b'A') => "added",
                    Some(b'D') => "deleted",
                    _ => "modified",
                },
            )
        };
        let (additions, deletions) = stats.get(&path).copied().unwrap_or_default();
        let patch_omitted = if status == "deleted" {
            Some("deleted".into())
        } else if additions + deletions >= 1_000 {
            Some("large".into())
        } else {
            Some("lazy".into())
        };
        files.push(ComparedFile {
            path,
            old_path,
            status: status.into(),
            additions,
            deletions,
            patch: String::new(),
            patch_omitted,
        });
    }
    Ok(files)
}

async fn diff_stats(repository: &Path, range: &str) -> Result<HashMap<String, (usize, usize)>> {
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["diff", "--numstat", "-z", "--find-renames", range])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!("git diff stats failed")
    }
    let records = output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .collect::<Vec<_>>();
    let mut stats = HashMap::new();
    let mut index = 0;
    while index < records.len() {
        let record = String::from_utf8_lossy(records[index]);
        let mut fields = record.splitn(3, '\t');
        let additions = fields
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        let deletions = fields
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        let Some(path) = fields.next() else {
            index += 1;
            continue;
        };
        if path.is_empty() {
            if index + 2 >= records.len() {
                break;
            }
            stats.insert(
                String::from_utf8_lossy(records[index + 2]).into_owned(),
                (additions, deletions),
            );
            index += 3;
        } else {
            stats.insert(path.to_owned(), (additions, deletions));
            index += 1;
        }
    }
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;
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
}
