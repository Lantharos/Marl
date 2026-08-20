use crate::process::Command;
use crate::state::{
    AppState, git_output, is_object_id, repository_path, safe_repository_path, safe_segment,
};
use anyhow::{Context, Result};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::Write,
    path::Path,
    process::Stdio,
    sync::Arc,
};
use tokio::{
    io::AsyncWriteExt,
    time::{Duration, sleep},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IndexRequest {
    repository_id: String,
    owner: String,
    repository: String,
    #[serde(default)]
    index_id: String,
    #[serde(default)]
    exclude_commits: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitIndexPage<'a> {
    repository_id: &'a str,
    index_id: &'a str,
    complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_branch: Option<&'a str>,
    commits: &'a [IndexedCommit],
    branches: &'a [IndexedBranch],
    entries: &'a [IndexedEntry],
    changes: &'a [IndexedChange],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedCommit {
    id: String,
    title: String,
    author: String,
    author_email: String,
    authored_at: String,
    tree_id: String,
    parents: Vec<String>,
    signature_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    signature_signer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    signature_key_fingerprint: Option<String>,
    #[serde(skip)]
    position: usize,
    #[serde(skip)]
    signed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SigningKey {
    user_id: String,
    email: String,
    public_key: String,
    fingerprint: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SigningKeysResponse {
    signing_keys: Vec<SigningKey>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedBranch {
    name: String,
    commit_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedEntry {
    tree_id: String,
    path: String,
    parent_path: String,
    name: String,
    kind: String,
    object_id: String,
    byte_size: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedChange {
    commit_id: String,
    position: usize,
    paths: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TreeRequest {
    owner: String,
    repository: String,
    commit_id: String,
    path: String,
}

#[derive(Serialize)]
struct TreeResponse {
    entries: Vec<IndexedEntry>,
}

#[derive(Deserialize)]
struct PendingIndexes {
    repositories: Vec<IndexRequest>,
}

pub(crate) async fn backfill_pending_repositories(state: Arc<AppState>) {
    for attempt in 0..10 {
        let response = state
            .client
            .get(format!(
                "{}/api/v1/git/pending-indexes",
                state.control_plane
            ))
            .header("x-marl-gateway-token", &state.gateway_token)
            .send()
            .await;
        match response {
            Ok(response) if response.status().is_success() => {
                match response.json::<PendingIndexes>().await {
                    Ok(pending) => {
                        for repository in pending.repositories {
                            if let Err(error) = index_inner(&state, repository).await {
                                eprintln!("repository history backfill failed: {error:#}");
                            }
                        }
                    }
                    Err(error) => eprintln!("decode pending repository indexes failed: {error:#}"),
                }
                return;
            }
            Ok(response) => eprintln!(
                "pending repository index request failed with {}",
                response.status()
            ),
            Err(error) if attempt == 9 => {
                eprintln!("pending repository index request failed: {error:#}")
            }
            Err(_) => {}
        }
        sleep(Duration::from_millis(250 * (attempt + 1))).await;
    }
}

pub(crate) async fn index_repository(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<IndexRequest>,
) -> Response {
    if headers
        .get("x-marl-storage-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    match index_inner(&state, request).await {
        Ok(heads) => Json(serde_json::json!({ "heads": heads })).into_response(),
        Err(error) => {
            eprintln!("repository indexing failed: {error:#}");
            (StatusCode::BAD_GATEWAY, "Repository indexing failed.\n").into_response()
        }
    }
}

pub(crate) async fn read_tree(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<TreeRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    match read_tree_inner(&state, request).await {
        Ok(entries) => Json(TreeResponse { entries }).into_response(),
        Err(error) => {
            eprintln!("repository tree read failed: {error:#}");
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn read_tree_inner(state: &AppState, request: TreeRequest) -> Result<Vec<IndexedEntry>> {
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !is_object_id(&request.commit_id)
        || (!request.path.is_empty() && !safe_repository_path(&request.path))
    {
        anyhow::bail!("invalid repository tree request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    let tree_id = git_output(
        &repository,
        &["rev-parse", &format!("{}^{{tree}}", request.commit_id)],
    )
    .await?;
    let treeish = if request.path.is_empty() {
        request.commit_id
    } else {
        format!("{}:{}", request.commit_id, request.path)
    };
    let output = Command::new("git")
        .args(["-C"])
        .arg(&repository)
        .args(["ls-tree", "-l", "-z", &treeish])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "git ls-tree failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
    Ok(parse_tree_entries(
        &output.stdout,
        tree_id.trim(),
        &request.path,
    ))
}

async fn index_inner(state: &AppState, request: IndexRequest) -> Result<Vec<String>> {
    if !request.repository_id.starts_with("repo_")
        || !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
    {
        anyhow::bail!("invalid repository index request")
    }
    let repository = repository_path(&state.repositories, &request.owner, &request.repository)?;
    let refs = git_output(
        &repository,
        &[
            "for-each-ref",
            "--format=%(refname:short)%1f%(objectname)%1e",
            "refs/heads",
        ],
    )
    .await?;
    let branches = parse_records(&refs, 2)
        .into_iter()
        .map(|fields| IndexedBranch {
            name: fields[0].clone(),
            commit_id: fields[1].clone(),
        })
        .collect::<Vec<_>>();
    let head = git_output(&repository, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .await
        .unwrap_or_default();
    let default_branch = branches
        .iter()
        .find(|branch| branch.name == head.trim())
        .or_else(|| branches.iter().find(|branch| branch.name == "main"))
        .or_else(|| branches.first())
        .map(|branch| branch.name.clone())
        .unwrap_or_else(|| "main".into());
    let history = if branches.is_empty() {
        String::new()
    } else {
        let mut command = Command::new("git");
        command.args(["-C"]).arg(&repository).args([
            "log",
            "--all",
            "--topo-order",
            "--date=iso-strict",
            "--format=%H%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%T%x1f%P%x1f%ct%x1e",
            "--ignore-missing",
        ]);
        for commit in request
            .exclude_commits
            .iter()
            .filter(|commit| is_object_id(commit))
        {
            command.arg("--not").arg(commit);
        }
        let output = command.output().await?;
        if !output.status.success() {
            anyhow::bail!(
                "git log failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )
        }
        String::from_utf8(output.stdout)?
    };
    let mut commits = parse_records(&history, 8)
        .into_iter()
        .map(|fields| IndexedCommit {
            id: fields[0].clone(),
            title: fields[1].clone(),
            author: fields[2].clone(),
            author_email: fields[3].clone(),
            authored_at: fields[4].clone(),
            tree_id: fields[5].clone(),
            parents: fields[6].split_whitespace().map(str::to_owned).collect(),
            position: fields[7].parse().unwrap_or(0),
            signature_status: "unverified".into(),
            signature_signer_id: None,
            signature_key_fingerprint: None,
            signed: false,
        })
        .collect::<Vec<_>>();
    mark_signed_commits(&repository, &mut commits).await?;
    verify_commit_signatures(state, &repository, &mut commits).await?;
    let changes = index_changes(&repository, &commits, &request.exclude_commits).await?;
    let mut indexed = HashSet::new();
    let mut entries = Vec::new();
    for branch in &branches {
        let tree_id = git_output(
            &repository,
            &["rev-parse", &format!("{}^{{tree}}", branch.commit_id)],
        )
        .await?;
        let tree_id = tree_id.trim();
        if indexed.insert(tree_id.to_owned()) {
            entries.extend(index_tree(&repository, &branch.commit_id, tree_id).await?);
        }
    }
    let index_id = if request.index_id.is_empty() {
        format!(
            "index_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_nanos()
        )
    } else {
        request.index_id
    };
    for page in commits.chunks(250) {
        send_index_page(
            state,
            GitIndexPage {
                repository_id: &request.repository_id,
                index_id: &index_id,
                complete: false,
                default_branch: None,
                commits: page,
                branches: &[],
                entries: &[],
                changes: &[],
            },
        )
        .await?;
    }
    let mut change_start = 0;
    while change_start < changes.len() {
        let mut change_end = change_start;
        let mut path_count = 0;
        while change_end < changes.len() && change_end - change_start < 250 {
            let next = changes[change_end].paths.len();
            if next > 100_000 {
                anyhow::bail!(
                    "a commit changes more paths than the metadata index can safely accept"
                )
            }
            if change_end > change_start && path_count + next > 100_000 {
                break;
            }
            path_count += next;
            change_end += 1;
        }
        send_index_page(
            state,
            GitIndexPage {
                repository_id: &request.repository_id,
                index_id: &index_id,
                complete: false,
                default_branch: None,
                commits: &[],
                branches: &[],
                entries: &[],
                changes: &changes[change_start..change_end],
            },
        )
        .await?;
        change_start = change_end;
    }
    for page in entries.chunks(1_000) {
        send_index_page(
            state,
            GitIndexPage {
                repository_id: &request.repository_id,
                index_id: &index_id,
                complete: false,
                default_branch: None,
                commits: &[],
                branches: &[],
                entries: page,
                changes: &[],
            },
        )
        .await?;
    }
    for page in branches.chunks(250) {
        send_index_page(
            state,
            GitIndexPage {
                repository_id: &request.repository_id,
                index_id: &index_id,
                complete: false,
                default_branch: None,
                commits: &[],
                branches: page,
                entries: &[],
                changes: &[],
            },
        )
        .await?;
    }
    send_index_page(
        state,
        GitIndexPage {
            repository_id: &request.repository_id,
            index_id: &index_id,
            complete: true,
            default_branch: Some(&default_branch),
            commits: &[],
            branches: &[],
            entries: &[],
            changes: &[],
        },
    )
    .await?;
    Ok(branches
        .into_iter()
        .map(|branch| branch.commit_id)
        .collect())
}

async fn mark_signed_commits(repository: &Path, commits: &mut [IndexedCommit]) -> Result<()> {
    if commits.is_empty() {
        return Ok(());
    }
    let mut child = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["cat-file", "--batch"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("start commit signature scan")?;
    let input = commits
        .iter()
        .map(|commit| commit.id.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    child
        .stdin
        .take()
        .context("open commit signature scan input")?
        .write_all(format!("{input}\n").as_bytes())
        .await
        .context("write commit signature scan input")?;
    let output = child
        .wait_with_output()
        .await
        .context("read commit signature scan")?;
    if !output.status.success() {
        anyhow::bail!(
            "commit signature scan failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
    let mut cursor = 0;
    for commit in commits {
        let header_end = output.stdout[cursor..]
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|offset| cursor + offset)
            .context("invalid commit signature scan header")?;
        let header = std::str::from_utf8(&output.stdout[cursor..header_end])?;
        let size = header
            .split_whitespace()
            .next_back()
            .context("missing commit object size")?
            .parse::<usize>()
            .context("invalid commit object size")?;
        let object_start = header_end + 1;
        let object_end = object_start + size;
        let object = output
            .stdout
            .get(object_start..object_end)
            .context("truncated commit signature scan")?;
        commit.signed = object
            .split(|byte| *byte == b'\n')
            .any(|line| line.starts_with(b"gpgsig ") || line.starts_with(b"gpgsig-sha256 "));
        cursor = object_end + 1;
    }
    Ok(())
}

async fn verify_commit_signatures(
    state: &AppState,
    repository: &Path,
    commits: &mut [IndexedCommit],
) -> Result<()> {
    let emails = commits
        .iter()
        .filter(|commit| commit.signed)
        .map(|commit| commit.author_email.trim().to_lowercase())
        .filter(|email| !email.is_empty())
        .collect::<HashSet<_>>();
    if emails.is_empty() {
        return Ok(());
    }
    let response = state
        .client
        .post(format!("{}/api/v1/git/signing-keys", state.control_plane))
        .header("x-marl-gateway-token", &state.gateway_token)
        .json(&serde_json::json!({ "emails": emails }))
        .send()
        .await
        .context("request linked SSH signing keys")?
        .error_for_status()
        .context("control plane rejected signing key lookup")?
        .json::<SigningKeysResponse>()
        .await
        .context("decode linked SSH signing keys")?;
    let mut by_email = HashMap::<String, Vec<SigningKey>>::new();
    for key in response.signing_keys {
        by_email
            .entry(key.email.to_lowercase())
            .or_default()
            .push(key);
    }
    for commit in commits.iter_mut().filter(|commit| commit.signed) {
        let Some(keys) = by_email.get(&commit.author_email.to_lowercase()) else {
            continue;
        };
        let mut allowed = tempfile::NamedTempFile::new().context("create allowed signers file")?;
        for key in keys {
            writeln!(allowed, "{} {}", key.user_id, key.public_key)
                .context("write allowed SSH signer")?;
        }
        allowed.flush().context("flush allowed signers file")?;
        let output = Command::new("git")
            .args(["-C"])
            .arg(repository)
            .arg("-c")
            .arg("gpg.format=ssh")
            .arg("-c")
            .arg(format!(
                "gpg.ssh.allowedSignersFile={}",
                allowed.path().display()
            ))
            .args(["verify-commit", "--raw", &commit.id])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .context("verify SSH commit signature")?;
        if !output.status.success() {
            commit.signature_status = "invalid".into();
            continue;
        }
        let verification = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let fingerprint = verification
            .split_whitespace()
            .find(|part| part.starts_with("SHA256:"))
            .map(|part| {
                part.trim_matches(|character: char| {
                    !character.is_ascii_alphanumeric()
                        && !matches!(character, ':' | '+' | '/' | '=')
                })
                .to_owned()
            });
        let Some(key) = fingerprint
            .as_ref()
            .and_then(|fingerprint| keys.iter().find(|key| &key.fingerprint == fingerprint))
        else {
            commit.signature_status = "invalid".into();
            continue;
        };
        commit.signature_status = "verified".into();
        commit.signature_signer_id = Some(key.user_id.clone());
        commit.signature_key_fingerprint = Some(key.fingerprint.clone());
    }
    Ok(())
}

async fn send_index_page(state: &AppState, page: GitIndexPage<'_>) -> Result<()> {
    state
        .client
        .post(format!("{}/api/v1/git/index", state.control_plane))
        .header("x-marl-gateway-token", &state.gateway_token)
        .json(&page)
        .send()
        .await
        .context("send Git index page")?
        .error_for_status()
        .context("control plane rejected Git index page")?;
    Ok(())
}

async fn index_changes(
    repository: &Path,
    commits: &[IndexedCommit],
    exclude_commits: &[String],
) -> Result<Vec<IndexedChange>> {
    if commits.is_empty() {
        return Ok(Vec::new());
    }
    let mut command = Command::new("git");
    command.args(["-C"]).arg(repository).args([
        "log",
        "--all",
        "--topo-order",
        "--ignore-missing",
        "--format=C%H%x00",
        "--name-status",
        "-z",
        "--no-renames",
    ]);
    for commit in exclude_commits.iter().filter(|commit| is_object_id(commit)) {
        command.arg("--not").arg(commit);
    }
    let output = command.output().await?;
    if !output.status.success() {
        anyhow::bail!(
            "git log changed paths failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
    Ok(parse_changed_paths(&output.stdout, commits))
}

fn parse_changed_paths(output: &[u8], commits: &[IndexedCommit]) -> Vec<IndexedChange> {
    let positions = commits
        .iter()
        .enumerate()
        .map(|(index, commit)| (commit.id.as_str(), index))
        .collect::<HashMap<_, _>>();
    let mut paths = vec![HashSet::new(); commits.len()];
    let mut current = None;
    let mut tokens = output
        .split(|byte| *byte == 0)
        .filter(|token| !token.is_empty());
    while let Some(token) = tokens.next() {
        if token.first() == Some(&b'C') {
            current = std::str::from_utf8(&token[1..])
                .ok()
                .and_then(|id| positions.get(id).copied());
            continue;
        }
        if token.len() != 1 || !token[0].is_ascii_alphabetic() {
            current = None;
            continue;
        }
        let Some(path) = tokens.next() else { break };
        let Some(index) = current else { continue };
        let path = String::from_utf8_lossy(path).replace('\\', "/");
        if path.is_empty() {
            continue;
        }
        paths[index].insert(path.clone());
        let mut ancestor = path.as_str();
        while let Some((parent, _)) = ancestor.rsplit_once('/') {
            paths[index].insert(parent.to_owned());
            ancestor = parent;
        }
    }
    commits
        .iter()
        .zip(paths)
        .map(|(commit, paths)| {
            let mut paths = paths.into_iter().collect::<Vec<_>>();
            paths.sort_unstable();
            IndexedChange {
                commit_id: commit.id.clone(),
                position: commit.position,
                paths,
            }
        })
        .collect()
}

pub(crate) async fn index_local_repository(
    state: &AppState,
    repository_id: String,
    owner: String,
    repository: String,
) -> Result<()> {
    index_inner(
        state,
        IndexRequest {
            repository_id,
            owner,
            repository,
            index_id: String::new(),
            exclude_commits: Vec::new(),
        },
    )
    .await
    .map(|_| ())
}

async fn index_tree(
    repository: &Path,
    commit_id: &str,
    tree_id: &str,
) -> Result<Vec<IndexedEntry>> {
    let tree = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["ls-tree", "-r", "-t", "-l", "-z", commit_id])
        .output()
        .await?;
    if !tree.status.success() {
        anyhow::bail!(
            "git ls-tree failed: {}",
            String::from_utf8_lossy(&tree.stderr)
        )
    }
    Ok(parse_tree_entries(&tree.stdout, tree_id, ""))
}

fn parse_tree_entries(output: &[u8], tree_id: &str, prefix: &str) -> Vec<IndexedEntry> {
    let mut entries = Vec::new();
    for record in output
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
    {
        let Some(tab) = record.iter().position(|byte| *byte == b'\t') else {
            continue;
        };
        let metadata = String::from_utf8_lossy(&record[..tab]);
        let name_path = String::from_utf8_lossy(&record[tab + 1..]);
        let path = if prefix.is_empty() {
            name_path.into_owned()
        } else {
            format!("{prefix}/{name_path}")
        };
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 4 {
            continue;
        }
        let parent_path = Path::new(&path)
            .parent()
            .filter(|value| !value.as_os_str().is_empty())
            .map(|value| value.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let name = Path::new(&path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        entries.push(IndexedEntry {
            tree_id: tree_id.into(),
            path,
            parent_path,
            name,
            kind: fields[1].into(),
            object_id: fields[2].into(),
            byte_size: fields[3].parse().ok(),
        });
    }
    entries
}

fn parse_records(value: &str, fields: usize) -> Vec<Vec<String>> {
    value
        .split('\x1e')
        .filter_map(|record| {
            let values = record
                .trim_start_matches(['\r', '\n'])
                .trim_end_matches(['\r', '\n'])
                .split('\x1f')
                .map(str::to_owned)
                .collect::<Vec<_>>();
            (values.len() == fields).then_some(values)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commit(id: &str, parents: &[&str], position: usize) -> IndexedCommit {
        IndexedCommit {
            id: id.into(),
            title: String::new(),
            author: String::new(),
            author_email: String::new(),
            authored_at: String::new(),
            tree_id: String::new(),
            parents: parents.iter().map(|parent| (*parent).to_owned()).collect(),
            signature_status: "unverified".into(),
            signature_signer_id: None,
            signature_key_fingerprint: None,
            position,
            signed: false,
        }
    }

    #[test]
    fn changed_paths_include_parent_directories() {
        let first = "1111111111111111111111111111111111111111";
        let second = "2222222222222222222222222222222222222222";
        let output = format!("C{first}\0\0M\0apps/web/src/app.ts\0C{second}\0\0A\0README.md\0");
        let changes = parse_changed_paths(
            output.as_bytes(),
            &[commit(first, &[second], 2), commit(second, &[], 1)],
        );
        assert_eq!(
            changes[0].paths,
            ["apps", "apps/web", "apps/web/src", "apps/web/src/app.ts"]
        );
        assert_eq!(changes[1].paths, ["README.md"]);
        assert_eq!(changes[0].position, 2);
        assert_eq!(changes[1].position, 1);
    }

    #[test]
    fn tree_entries_preserve_the_requested_directory() {
        let tree_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let blob_id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        let output = format!("100644 blob {blob_id} 12\tapp.ts\0");
        let entries = parse_tree_entries(output.as_bytes(), tree_id, "apps/web");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "apps/web/app.ts");
        assert_eq!(entries[0].parent_path, "apps/web");
        assert_eq!(entries[0].object_id, blob_id);
        assert_eq!(entries[0].byte_size, Some(12));
    }
}
