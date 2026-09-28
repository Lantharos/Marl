use crate::process::Command;
use crate::state::{AppState, git_output};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{path::Path, process::Stdio};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

mod languages;

use languages::{Symbol, extract, language_for};

const MAX_BLOB_BYTES: usize = 512 * 1024;
const FILES_PER_PAGE: usize = 200;
const SYMBOLS_PER_PAGE: usize = 5_000;
const MAX_REMOVED_PATHS: usize = 5_000;

#[derive(Serialize)]
struct SymbolFile {
    path: String,
    symbols: Vec<Symbol>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SymbolPage<'a> {
    repository_id: &'a str,
    commit_id: &'a str,
    reset: bool,
    complete: bool,
    removed: &'a [String],
    files: &'a [SymbolFile],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SymbolState {
    commit_id: Option<String>,
}

struct Change {
    path: String,
    object_id: String,
    language: usize,
}

struct Plan {
    reset: bool,
    changed: Vec<Change>,
    removed: Vec<String>,
}

pub(crate) async fn index_symbols(
    state: &AppState,
    repository: &Path,
    repository_id: &str,
    commit_id: &str,
) -> Result<()> {
    let indexed = state
        .client
        .post(format!("{}/api/v1/git/symbols/state", state.control_plane))
        .header("x-marl-gateway-token", &state.gateway_token)
        .json(&serde_json::json!({ "repositoryId": repository_id }))
        .send()
        .await?
        .error_for_status()?
        .json::<SymbolState>()
        .await?;
    if indexed.commit_id.as_deref() == Some(commit_id) {
        return Ok(());
    }
    let plan = match indexed.commit_id {
        Some(previous) if commit_exists(repository, &previous).await => {
            changes_between(repository, &previous, commit_id).await?
        }
        _ => all_files(repository, commit_id).await?,
    };
    let plan = if plan.removed.len() > MAX_REMOVED_PATHS {
        all_files(repository, commit_id).await?
    } else {
        plan
    };
    let mut files = read_symbols(repository, plan.changed).await?;
    let mut first = true;
    loop {
        let page = next_page(&mut files);
        let complete = files.is_empty();
        send_page(
            state,
            SymbolPage {
                repository_id,
                commit_id,
                reset: first && plan.reset,
                complete,
                removed: if first { &plan.removed } else { &[] },
                files: &page,
            },
        )
        .await?;
        first = false;
        if complete {
            return Ok(());
        }
    }
}

fn next_page(files: &mut Vec<SymbolFile>) -> Vec<SymbolFile> {
    let mut symbols = 0;
    let mut start = files.len();
    while start > 0 && files.len() - start < FILES_PER_PAGE {
        let next = files[start - 1].symbols.len();
        if start < files.len() && symbols + next > SYMBOLS_PER_PAGE {
            break;
        }
        symbols += next;
        start -= 1;
    }
    files.split_off(start)
}

async fn commit_exists(repository: &Path, commit_id: &str) -> bool {
    git_output(
        repository,
        &["cat-file", "-e", &format!("{commit_id}^{{commit}}")],
    )
    .await
    .is_ok()
}

async fn all_files(repository: &Path, commit_id: &str) -> Result<Plan> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repository)
        .args(["ls-tree", "-r", "-l", "-z", commit_id])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "git ls-tree failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
    let changed = output
        .stdout
        .split(|byte| *byte == 0)
        .filter_map(|record| {
            let tab = record.iter().position(|byte| *byte == b'\t')?;
            let mut fields = std::str::from_utf8(&record[..tab]).ok()?.split_whitespace();
            let (_, kind, object_id, size) = (
                fields.next()?,
                fields.next()?,
                fields.next()?,
                fields.next()?,
            );
            let path = std::str::from_utf8(&record[tab + 1..]).ok()?;
            (kind == "blob" && size.parse::<usize>().ok()? <= MAX_BLOB_BYTES)
                .then_some(())
                .and(language_for(path))
                .map(|language| Change {
                    path: path.to_owned(),
                    object_id: object_id.to_owned(),
                    language,
                })
        })
        .collect();
    Ok(Plan {
        reset: true,
        changed,
        removed: Vec::new(),
    })
}

async fn changes_between(repository: &Path, previous: &str, commit_id: &str) -> Result<Plan> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repository)
        .args(["diff-tree", "-r", "-z", "--no-renames", previous, commit_id])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "git diff-tree failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    }
    let mut plan = Plan {
        reset: false,
        changed: Vec::new(),
        removed: Vec::new(),
    };
    let mut records = output.stdout.split(|byte| *byte == 0);
    while let (Some(metadata), Some(path)) = (records.next(), records.next()) {
        let (Ok(metadata), Ok(path)) = (std::str::from_utf8(metadata), std::str::from_utf8(path))
        else {
            continue;
        };
        let fields = metadata.split_whitespace().collect::<Vec<_>>();
        let Some(language) = language_for(path) else {
            continue;
        };
        if fields.len() < 5 || fields[4] == "D" || fields[1] == "120000" {
            plan.removed.push(path.to_owned());
        } else {
            plan.changed.push(Change {
                path: path.to_owned(),
                object_id: fields[3].to_owned(),
                language,
            });
        }
    }
    Ok(plan)
}

async fn read_symbols(repository: &Path, changes: Vec<Change>) -> Result<Vec<SymbolFile>> {
    if changes.is_empty() {
        return Ok(Vec::new());
    }
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repository)
        .args(["cat-file", "--batch"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let mut stdin = child.stdin.take().context("cat-file stdin")?;
    let mut stdout = BufReader::new(child.stdout.take().context("cat-file stdout")?);
    let requests = changes
        .iter()
        .map(|change| format!("{}\n", change.object_id))
        .collect::<String>();
    let writer = tokio::spawn(async move { stdin.write_all(requests.as_bytes()).await });
    let mut files = Vec::with_capacity(changes.len());
    let mut header = Vec::new();
    for change in changes {
        header.clear();
        stdout.read_until(b'\n', &mut header).await?;
        let size = std::str::from_utf8(&header)?
            .trim_end()
            .rsplit_once(' ')
            .and_then(|(_, size)| size.parse::<usize>().ok());
        let symbols = match size {
            Some(size) => {
                let mut content = vec![0; size + 1];
                stdout.read_exact(&mut content).await?;
                content.pop();
                if size <= MAX_BLOB_BYTES && !content[..size.min(8000)].contains(&0) {
                    extract(change.language, &content)
                } else {
                    Vec::new()
                }
            }
            None => Vec::new(),
        };
        files.push(SymbolFile {
            path: change.path,
            symbols,
        });
    }
    writer.await??;
    Ok(files)
}

async fn send_page(state: &AppState, page: SymbolPage<'_>) -> Result<()> {
    state
        .client
        .post(format!("{}/api/v1/git/symbols", state.control_plane))
        .header("x-marl-gateway-token", &state.gateway_token)
        .json(&page)
        .send()
        .await
        .context("send symbol page")?
        .error_for_status()
        .context("control plane rejected symbol page")?;
    Ok(())
}
