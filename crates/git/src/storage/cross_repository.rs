use crate::{
    process::Command,
    state::{AppState, repository_path, safe_segment},
};
use anyhow::Result;
use std::{path::Path, process::Stdio};

pub(crate) async fn import_commit(
    state: &AppState,
    destination: &Path,
    source_owner: Option<&str>,
    source_repository: Option<&str>,
    commit: &str,
) -> Result<()> {
    let (Some(owner), Some(repository)) = (source_owner, source_repository) else {
        return Ok(());
    };
    if !safe_segment(owner) || !safe_segment(repository) {
        anyhow::bail!("invalid source repository");
    }
    let source = repository_path(&state.repositories, owner, repository)?;
    if source == destination {
        return Ok(());
    }
    let output = Command::new("git")
        .args(["-C"])
        .arg(destination)
        .args(["fetch", "--no-tags", "--quiet", "--"])
        .arg(source)
        .arg(commit)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "source commit import failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(())
}
