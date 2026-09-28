use super::{SearchFile, matching};
use crate::process::Command;
use anyhow::{Context, Result};
use regex::bytes::Regex;
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    task::JoinSet,
    time::Instant,
};

const MAX_BLOB_BYTES: usize = 1024 * 1024;
const SEARCH_BUDGET: Duration = Duration::from_secs(8);
const MAX_WORKERS: usize = 8;

pub(super) struct PathFilter {
    paths: Vec<String>,
    extensions: Vec<String>,
}

impl PathFilter {
    pub(super) fn new(paths: &[String], extensions: &[String]) -> Self {
        Self {
            paths: paths.iter().map(|path| path.to_lowercase()).collect(),
            extensions: extensions
                .iter()
                .map(|extension| format!(".{}", extension.to_lowercase()))
                .collect(),
        }
    }

    fn allows(&self, path: &str) -> bool {
        let path = path.to_lowercase();
        (self.paths.is_empty() || self.paths.iter().any(|filter| path.contains(filter)))
            && (self.extensions.is_empty()
                || self
                    .extensions
                    .iter()
                    .any(|extension| path.ends_with(extension)))
    }
}

struct Candidate {
    path: String,
    object_id: String,
}

struct Progress {
    found: AtomicUsize,
    stopped: AtomicBool,
    limit: usize,
    deadline: Instant,
}

impl Progress {
    fn finished(&self) -> bool {
        if Instant::now() >= self.deadline {
            self.stopped.store(true, Ordering::Relaxed);
        }
        self.stopped.load(Ordering::Relaxed)
    }

    fn record(&self) {
        if self.found.fetch_add(1, Ordering::Relaxed) + 1 > self.limit {
            self.stopped.store(true, Ordering::Relaxed);
        }
    }
}

pub(super) async fn search(
    repository: &Path,
    commit_id: &str,
    pattern: Regex,
    filter: PathFilter,
    limit: usize,
) -> Result<(Vec<SearchFile>, bool)> {
    let candidates = candidates(repository, commit_id, &filter).await?;
    let workers = std::thread::available_parallelism()
        .map_or(4, |count| count.get())
        .clamp(1, MAX_WORKERS);
    let chunk_size = candidates.len().div_ceil(workers).max(1);
    let pattern = Arc::new(pattern);
    let progress = Arc::new(Progress {
        found: AtomicUsize::new(0),
        stopped: AtomicBool::new(false),
        limit,
        deadline: Instant::now() + SEARCH_BUDGET,
    });
    let mut tasks = JoinSet::new();
    let mut remaining = candidates;
    while !remaining.is_empty() {
        let rest = remaining.split_off(chunk_size.min(remaining.len()));
        tasks.spawn(scan_blobs(
            repository.to_owned(),
            std::mem::replace(&mut remaining, rest),
            pattern.clone(),
            progress.clone(),
        ));
    }
    let mut files = Vec::new();
    while let Some(result) = tasks.join_next().await {
        files.extend(result.context("join code search worker")??);
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    let truncated = progress.stopped.load(Ordering::Relaxed) || files.len() > limit;
    files.truncate(limit);
    Ok((files, truncated))
}

async fn candidates(
    repository: &Path,
    commit_id: &str,
    filter: &PathFilter,
) -> Result<Vec<Candidate>> {
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
    Ok(output
        .stdout
        .split(|byte| *byte == 0)
        .filter_map(|record| {
            let tab = record.iter().position(|byte| *byte == b'\t')?;
            let metadata = std::str::from_utf8(&record[..tab]).ok()?;
            let path = String::from_utf8_lossy(&record[tab + 1..]).into_owned();
            let mut fields = metadata.split_whitespace();
            let (mode, kind, object_id, size) = (
                fields.next()?,
                fields.next()?,
                fields.next()?,
                fields.next()?,
            );
            let size = size.parse::<usize>().ok()?;
            (kind == "blob"
                && mode != "120000"
                && size > 0
                && size <= MAX_BLOB_BYTES
                && filter.allows(&path))
            .then(|| Candidate {
                path,
                object_id: object_id.to_owned(),
            })
        })
        .collect())
}

async fn scan_blobs(
    repository: PathBuf,
    candidates: Vec<Candidate>,
    pattern: Arc<Regex>,
    progress: Arc<Progress>,
) -> Result<Vec<SearchFile>> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(&repository)
        .args(["cat-file", "--batch"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let mut stdin = child.stdin.take().context("cat-file stdin")?;
    let mut stdout = BufReader::new(child.stdout.take().context("cat-file stdout")?);
    let requests = candidates
        .iter()
        .map(|candidate| format!("{}\n", candidate.object_id))
        .collect::<String>();
    let writer = tokio::spawn(async move { stdin.write_all(requests.as_bytes()).await });
    let mut files = Vec::new();
    let mut header = Vec::new();
    for candidate in candidates {
        if progress.finished() {
            break;
        }
        header.clear();
        stdout.read_until(b'\n', &mut header).await?;
        let header = std::str::from_utf8(&header)?.trim_end();
        let Some(size) = header
            .rsplit_once(' ')
            .and_then(|(_, size)| size.parse::<usize>().ok())
        else {
            continue;
        };
        let mut content = vec![0; size + 1];
        stdout.read_exact(&mut content).await?;
        content.pop();
        if matching::is_binary(&content) {
            continue;
        }
        if let Some(file) =
            matching::match_file(&pattern, candidate.path, candidate.object_id, &content)
        {
            progress.record();
            files.push(file);
        }
    }
    writer.abort();
    Ok(files)
}
