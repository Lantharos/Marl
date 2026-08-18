use crate::process::Command;
use anyhow::{Context, Result};
use std::path::{Component, Path, PathBuf};

#[derive(Clone)]
pub(crate) struct AppState {
    pub repositories: PathBuf,
    pub control_plane: String,
    pub client: reqwest::Client,
    pub gateway_token: String,
    pub local_storage: bool,
}

pub(crate) fn safe_segment(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        && value != "."
        && value != ".."
}

pub(crate) fn safe_ref(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('/')
        && !value.ends_with('/')
        && !value.ends_with('.')
        && !value.contains("..")
        && !value.contains("@{")
        && !value.contains("//")
        && value
            .split('/')
            .all(|part| !part.is_empty() && !part.starts_with('.') && !part.ends_with(".lock"))
        && !value.bytes().any(|byte| {
            byte <= b' '
                || byte == 0x7f
                || matches!(byte, b'~' | b'^' | b':' | b'?' | b'*' | b'[' | b'\\')
        })
}

pub(crate) fn is_object_id(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub(crate) fn safe_repository_path(value: &str) -> bool {
    !value.starts_with('/')
        && !value.contains('\\')
        && value
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

pub(crate) fn repository_path(root: &Path, owner: &str, repository: &str) -> Result<PathBuf> {
    let value = root.join(owner).join(format!("{repository}.git"));
    if value
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        anyhow::bail!("unsafe repository path")
    }
    Ok(value)
}

pub(crate) async fn git_output(repository: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(args)
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "git {} failed: {}",
            args.first().unwrap_or(&"command"),
            String::from_utf8_lossy(&output.stderr)
        );
    }
    String::from_utf8(output.stdout).context("Git output was not UTF-8")
}
