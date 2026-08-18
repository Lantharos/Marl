use crate::{models::RunnerConfig, process::standard_command};
use anyhow::{Context, Result, bail};
use std::path::{Path, PathBuf};

pub fn default_config_path() -> Result<PathBuf> {
    if let Some(path) = std::env::var_os("STY_RUNNER_CONFIG") {
        return Ok(PathBuf::from(path));
    }
    let root = std::env::var_os(if cfg!(windows) {
        "LOCALAPPDATA"
    } else {
        "HOME"
    })
    .context("could not determine the runner config directory")?;
    Ok(if cfg!(windows) {
        PathBuf::from(root).join("Sty").join("runner.json")
    } else {
        PathBuf::from(root).join(".config/sty/runner.json")
    })
}

pub fn default_work_dir() -> Result<PathBuf> {
    let root = std::env::var_os(if cfg!(windows) {
        "LOCALAPPDATA"
    } else {
        "HOME"
    })
    .context("could not determine the runner work directory")?;
    Ok(if cfg!(windows) {
        PathBuf::from(root).join("Sty").join("work")
    } else {
        PathBuf::from(root).join(".local/share/sty/work")
    })
}

pub fn load(path: &Path) -> Result<RunnerConfig> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("could not read runner config {}", path.display()))?;
    serde_json::from_slice(&bytes).context("runner config is invalid")
}

pub fn save(path: &Path, config: &RunnerConfig) -> Result<()> {
    let parent = path
        .parent()
        .context("runner config needs a parent directory")?;
    std::fs::create_dir_all(parent)
        .with_context(|| format!("could not create {}", parent.display()))?;
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, serde_json::to_vec_pretty(config)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600))?;
    }
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    std::fs::rename(&temporary, path)?;
    #[cfg(windows)]
    {
        let user =
            std::env::var("USERNAME").context("could not identify the runner config owner")?;
        let status = standard_command("icacls.exe")
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &format!("{user}:(R,W)"),
                "SYSTEM:(R)",
            ])
            .status()
            .context("could not restrict runner config permissions")?;
        if !status.success() {
            bail!("could not restrict runner config permissions")
        }
    }
    Ok(())
}

pub fn ensure_job_path(root: &Path, job_id: &str) -> Result<PathBuf> {
    if !job_id.starts_with("job_")
        || !job_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '_')
    {
        bail!("server returned an invalid job identifier")
    }
    Ok(root.join(job_id))
}
