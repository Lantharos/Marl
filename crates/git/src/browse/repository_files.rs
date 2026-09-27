use crate::process::Command;
use crate::state::{is_object_id, safe_ref};
use anyhow::{Context, Result, bail};
use axum::extract::Request;
use futures_util::TryStreamExt;
use std::{collections::BTreeMap, path::Path};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
};
use tokio_util::io::StreamReader;

pub(crate) async fn ensure_bare_repository(path: &Path) -> Result<()> {
    if fs::try_exists(path.join("HEAD")).await? {
        return Ok(());
    }
    fs::create_dir_all(path.parent().context("repository parent")?).await?;
    let output = Command::new("git")
        .args(["init", "--bare", "--initial-branch=main"])
        .arg(path)
        .output()
        .await?;
    if !output.status.success() {
        bail!(
            "git init failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
    }
    let output = Command::new("git")
        .args(["-C"])
        .arg(path)
        .args(["config", "http.receivepack", "true"])
        .output()
        .await?;
    if !output.status.success() {
        bail!("enable receive-pack failed")
    }
    Ok(())
}

pub(crate) async fn replace_refs(repository: &Path, refs: &BTreeMap<String, String>) -> Result<()> {
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["for-each-ref", "--format=%(refname)"])
        .output()
        .await?;
    if !output.status.success() {
        bail!("list repository refs failed")
    }
    let mut transaction = String::new();
    for name in String::from_utf8(output.stdout)?.lines() {
        if !refs.contains_key(name) {
            transaction.push_str(&format!("delete {name}\n"));
        }
    }
    for (name, object_id) in refs {
        transaction.push_str(&format!("update {name} {object_id}\n"));
    }
    if transaction.is_empty() {
        return repair_head(repository).await;
    }
    let mut child = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["update-ref", "--stdin"])
        .stdin(std::process::Stdio::piped())
        .spawn()?;
    child
        .stdin
        .take()
        .context("open update-ref stdin")?
        .write_all(transaction.as_bytes())
        .await?;
    if !child.wait().await?.success() {
        bail!("replace repository refs failed")
    }
    repair_head(repository).await?;
    Ok(())
}

pub(crate) async fn repair_head(repository: &Path) -> Result<()> {
    let current = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["symbolic-ref", "--quiet", "HEAD"])
        .output()
        .await?;
    if current.status.success() {
        let name = String::from_utf8(current.stdout)?;
        let exists = Command::new("git")
            .args(["-C"])
            .arg(repository)
            .args(["show-ref", "--verify", "--quiet", name.trim()])
            .status()
            .await?;
        if exists.success() {
            return Ok(());
        }
    }
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args([
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname)",
            "refs/heads",
        ])
        .output()
        .await?;
    if !output.status.success() {
        bail!("list repository branches failed")
    }
    let branches = String::from_utf8(output.stdout)?
        .lines()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let Some(branch) = branches
        .iter()
        .find(|branch| branch.as_str() == "refs/heads/main")
        .or_else(|| {
            branches
                .iter()
                .find(|branch| branch.as_str() == "refs/heads/master")
        })
        .or_else(|| branches.first())
    else {
        return Ok(());
    };
    let status = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["symbolic-ref", "HEAD", branch])
        .status()
        .await?;
    if !status.success() {
        bail!("set repository default branch failed")
    }
    Ok(())
}

pub(crate) async fn read_refs(repository: &Path) -> Result<BTreeMap<String, String>> {
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["for-each-ref", "--format=%(refname) %(objectname)"])
        .output()
        .await?;
    if !output.status.success() {
        bail!("read repository refs failed")
    }
    let mut refs = BTreeMap::new();
    for line in String::from_utf8(output.stdout)?.lines() {
        let (name, object_id) = line
            .split_once(' ')
            .context("invalid repository ref output")?;
        if !safe_ref(name) || !is_object_id(object_id) {
            bail!("repository contains an invalid ref")
        }
        refs.insert(name.to_owned(), object_id.to_owned());
    }
    Ok(refs)
}

pub(crate) async fn remove_inactive_packs(directory: &Path, active: &[String]) -> Result<()> {
    let mut entries = fs::read_dir(directory).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        let keep = active
            .iter()
            .any(|id| name == format!("pack-{id}.pack") || name == format!("pack-{id}.idx"));
        if !keep {
            fs::remove_file(entry.path()).await?;
        }
    }
    Ok(())
}

pub(crate) async fn remove_loose_objects(directory: &Path) -> Result<()> {
    let mut entries = fs::read_dir(directory).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        let loose = name.len() == 2 && name.bytes().all(|byte| byte.is_ascii_hexdigit());
        if loose || name.starts_with("incoming-") {
            fs::remove_dir_all(entry.path()).await?;
        }
    }
    Ok(())
}

pub(crate) async fn write_limited(request: Request, path: &Path, limit: u64) -> Result<()> {
    let stream = request
        .into_body()
        .into_data_stream()
        .map_err(std::io::Error::other);
    let mut reader = StreamReader::new(stream).take(limit + 1);
    let file_name = path
        .file_name()
        .context("repository pack filename")?
        .to_string_lossy();
    let temporary = path.with_file_name(format!("{file_name}.uploading"));
    let mut file = fs::File::create(&temporary).await?;
    let bytes = tokio::io::copy(&mut reader, &mut file).await?;
    file.flush().await?;
    if bytes > limit {
        let _ = fs::remove_file(temporary).await;
        bail!("repository pack exceeds its byte limit")
    }
    fs::rename(temporary, path).await?;
    Ok(())
}
