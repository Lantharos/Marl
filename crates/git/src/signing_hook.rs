use crate::{
    process::Command,
    signatures::enforce_commits,
    state::{AppState, is_object_id},
};
use anyhow::{Context, Result, bail};
use std::{path::Path, process::Stdio};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub(crate) fn configure(
    command: &mut Command,
    state: &AppState,
    repository_id: &str,
) -> Result<tempfile::TempDir> {
    let hooks = tempfile::tempdir().context("create signing hooks directory")?;
    let executable = std::env::current_exe()?
        .to_str()
        .context("invalid gateway executable path")?
        .replace('\\', "/")
        .replace('\'', "'\\''");
    let hook = hooks.path().join("pre-receive");
    std::fs::write(
        &hook,
        format!("#!/bin/sh\nexec '{executable}' --signing-hook\n"),
    )?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o700))?;
    }
    command
        .env("GIT_CONFIG_COUNT", "3")
        .env("GIT_CONFIG_KEY_2", "core.hooksPath")
        .env("GIT_CONFIG_VALUE_2", hooks.path())
        .env("MARL_API_URL", &state.control_plane)
        .env("MARL_GIT_GATEWAY_TOKEN", &state.gateway_token)
        .env("MARL_GIT_ROOT", &state.repositories)
        .env("MARL_SIGNING_REPOSITORY", repository_id);
    Ok(hooks)
}

pub(crate) async fn run(state: &AppState) -> Result<()> {
    let repository_id =
        std::env::var("MARL_SIGNING_REPOSITORY").context("signing hook repository is missing")?;
    let mut updates = String::new();
    tokio::io::stdin()
        .take(1024 * 1024 + 1)
        .read_to_string(&mut updates)
        .await?;
    if updates.len() > 1024 * 1024 {
        bail!("too many ref updates for signing verification");
    }
    let mut heads = Vec::new();
    for update in updates.lines() {
        let fields = update.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 3 || !is_object_id(fields[0]) || !is_object_id(fields[1]) {
            bail!("invalid signing hook ref update");
        }
        if !fields[1].bytes().all(|byte| byte == b'0') {
            heads.push(fields[1].to_owned());
        }
    }
    if heads.is_empty() {
        return Ok(());
    }
    let mut child = Command::new("git")
        .args([
            "--no-replace-objects",
            "rev-list",
            "--stdin",
            "--not",
            "--all",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    child
        .stdin
        .take()
        .context("open signing history input")?
        .write_all(format!("{}\n", heads.join("\n")).as_bytes())
        .await?;
    let output = child.wait_with_output().await?;
    if !output.status.success() {
        bail!("could not inspect incoming commit history");
    }
    let commits = String::from_utf8(output.stdout)?
        .lines()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    enforce_commits(state, &repository_id, Path::new("."), &commits).await
}
