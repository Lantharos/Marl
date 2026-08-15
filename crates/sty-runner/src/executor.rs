use crate::{
    client::RunnerClient,
    config::ensure_job_path,
    models::{JobLease, JobStep, RunnerConfig},
};
use anyhow::{Context, Result, bail};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::AsyncReadExt,
    process::Command,
    sync::{Semaphore, mpsc},
    task::JoinSet,
    time,
};

pub async fn run(config: RunnerConfig, once: bool) -> Result<()> {
    let client = RunnerClient::new(&config)?;
    let capacity = Arc::new(Semaphore::new(config.concurrency));
    let mut tasks = JoinSet::new();
    loop {
        client.heartbeat().await?;
        let mut queue_empty = false;
        while capacity.available_permits() > 0 {
            let Some(job) = client.claim().await? else {
                queue_empty = true;
                break;
            };
            let permit = capacity.clone().acquire_owned().await?;
            let job_client = client.clone();
            let job_config = config.clone();
            tasks.spawn(async move {
                let result = execute(&job_client, &job_config, &job).await;
                drop(permit);
                if let Err(error) = &result {
                    eprintln!("job {} failed: {error:#}", job.id);
                }
                result
            });
        }
        if once && queue_empty {
            while let Some(result) = tasks.join_next().await {
                result??;
            }
            return Ok(());
        }
        tokio::select! {
            result = tasks.join_next(), if !tasks.is_empty() => { if let Some(result) = result { result??; } }
            _ = time::sleep(Duration::from_secs(2)) => {}
        }
    }
}

async fn execute(client: &RunnerClient, config: &RunnerConfig, job: &JobLease) -> Result<()> {
    let result = execute_inner(client, config, job).await;
    match result {
        Ok(Outcome::Success) => {
            client
                .complete(job, "success", 0, "All steps passed.")
                .await
        }
        Ok(Outcome::Canceled) => {
            client
                .complete(job, "canceled", 130, "Canceled by Sty.")
                .await
        }
        Ok(Outcome::Failure(code)) => {
            client
                .complete(job, "failure", code, "A step failed.")
                .await
        }
        Err(error) => {
            let message = format!("runner error: {error:#}\n");
            let _ = client
                .log(job, 9_000_000_000_000, message.into_bytes())
                .await;
            client
                .complete(job, "failure", 1, "The runner could not execute this job.")
                .await?;
            Err(error)
        }
    }
}

enum Outcome {
    Success,
    Failure(i32),
    Canceled,
}

async fn execute_inner(
    client: &RunnerClient,
    config: &RunnerConfig,
    job: &JobLease,
) -> Result<Outcome> {
    let root = PathBuf::from(&config.work_dir);
    tokio::fs::create_dir_all(&root).await?;
    let workspace = ensure_job_path(&root, &job.id)?;
    clean_workspace(&root, &workspace).await?;
    let mut sequence = 0_u64;
    upload_text(
        client,
        job,
        &mut sequence,
        format!("sty · {} #{}\n", job.run.name, job.run.number),
    )
    .await?;
    upload_text(
        client,
        job,
        &mut sequence,
        format!(
            "repository: {}/{}\ncommit: {}\n\n",
            job.repository.owner, job.repository.name, job.commit_id
        ),
    )
    .await?;
    let clone = Command::new("git")
        .arg("clone")
        .arg("--no-checkout")
        .arg("--quiet")
        .arg(&job.repository.clone_url)
        .arg(&workspace)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "http.extraHeader")
        .env(
            "GIT_CONFIG_VALUE_0",
            format!("Authorization: Bearer {}", config.token),
        )
        .output()
        .await
        .context("could not start git clone")?;
    if !clone.stdout.is_empty() {
        client.log(job, sequence, clone.stdout).await?;
        sequence += 1;
    }
    if !clone.stderr.is_empty() {
        client.log(job, sequence, clone.stderr).await?;
        sequence += 1;
    }
    if !clone.status.success() {
        return Ok(Outcome::Failure(clone.status.code().unwrap_or(1)));
    }
    let checkout = Command::new("git")
        .arg("checkout")
        .arg("--detach")
        .arg("--quiet")
        .arg(&job.commit_id)
        .current_dir(&workspace)
        .output()
        .await?;
    if !checkout.stderr.is_empty() {
        client.log(job, sequence, checkout.stderr).await?;
        sequence += 1;
    }
    if !checkout.status.success() {
        return Ok(Outcome::Failure(checkout.status.code().unwrap_or(1)));
    }
    let cache = root
        .join("cache")
        .join(&job.repository.owner)
        .join(&job.repository.name);
    tokio::fs::create_dir_all(&cache).await?;
    for step in &job.steps {
        upload_text(
            client,
            job,
            &mut sequence,
            format!("\n── {} ──\n", step.name),
        )
        .await?;
        match execute_step(client, job, step, &workspace, &cache, &mut sequence).await? {
            Outcome::Success => {}
            outcome => {
                upload_artifacts(client, job, &workspace).await?;
                return Ok(outcome);
            }
        }
    }
    upload_artifacts(client, job, &workspace).await?;
    Ok(Outcome::Success)
}

async fn execute_step(
    client: &RunnerClient,
    job: &JobLease,
    step: &JobStep,
    workspace: &Path,
    cache: &Path,
    sequence: &mut u64,
) -> Result<Outcome> {
    let mut command = shell_command(step)?;
    command
        .current_dir(workspace)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    command
        .envs(&job.environment)
        .envs(&step.environment)
        .env("CI", "true")
        .env("STY", "true")
        .env("STY_RUN_NUMBER", job.run.number.to_string())
        .env("STY_COMMIT", &job.commit_id)
        .env("STY_BRANCH", &job.branch)
        .env("STY_CACHE_DIR", cache);
    let mut child = command
        .spawn()
        .with_context(|| format!("could not start step {}", step.name))?;
    let pid = child.id().context("step process has no process id")?;
    let stdout = child.stdout.take().context("step stdout unavailable")?;
    let stderr = child.stderr.take().context("step stderr unavailable")?;
    let (sender, mut receiver) = mpsc::channel::<Vec<u8>>(32);
    tokio::spawn(pump(stdout, sender.clone()));
    tokio::spawn(pump(stderr, sender.clone()));
    drop(sender);
    let mut renewal = time::interval(Duration::from_secs(15));
    renewal.tick().await;
    let mut waiting = Box::pin(child.wait());
    let status = loop {
        tokio::select! {
            status = &mut waiting => break status?,
            chunk = receiver.recv() => if let Some(chunk) = chunk { client.log(job, *sequence, chunk).await?; *sequence += 1; },
            _ = renewal.tick() => {
                let lease = client.renew(job).await?;
                if lease.canceled { kill_tree(pid).await; let _ = waiting.await; while let Some(chunk) = receiver.recv().await { client.log(job, *sequence, chunk).await?; *sequence += 1; } return Ok(Outcome::Canceled); }
            }
        }
    };
    while let Some(chunk) = receiver.recv().await {
        client.log(job, *sequence, chunk).await?;
        *sequence += 1;
    }
    Ok(if status.success() {
        Outcome::Success
    } else {
        Outcome::Failure(status.code().unwrap_or(1))
    })
}

fn shell_command(step: &JobStep) -> Result<Command> {
    let shell = step
        .shell
        .as_deref()
        .unwrap_or(if cfg!(windows) { "powershell" } else { "sh" });
    let mut command = Command::new(shell);
    match shell {
        "powershell" | "pwsh" => {
            command.args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &step.run,
            ]);
        }
        "cmd" => {
            command.args(["/D", "/S", "/C", &step.run]);
        }
        "sh" | "bash" => {
            command.args(["-e", "-c", &step.run]);
        }
        _ => bail!("unsupported shell {shell}"),
    }
    Ok(command)
}

async fn pump(mut reader: impl tokio::io::AsyncRead + Unpin, sender: mpsc::Sender<Vec<u8>>) {
    let mut buffer = vec![0; 32 * 1024];
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) | Err(_) => break,
            Ok(size) => {
                if sender.send(buffer[..size].to_vec()).await.is_err() {
                    break;
                }
            }
        }
    }
}

async fn upload_text(
    client: &RunnerClient,
    job: &JobLease,
    sequence: &mut u64,
    text: String,
) -> Result<()> {
    client.log(job, *sequence, text.into_bytes()).await?;
    *sequence += 1;
    Ok(())
}

async fn clean_workspace(root: &Path, workspace: &Path) -> Result<()> {
    if workspace.exists() {
        let canonical_root = tokio::fs::canonicalize(root).await?;
        let canonical_workspace = tokio::fs::canonicalize(workspace).await?;
        if !canonical_workspace.starts_with(&canonical_root) {
            bail!("refusing to remove a workspace outside the runner root")
        }
        tokio::fs::remove_dir_all(workspace).await?;
    }
    Ok(())
}

async fn upload_artifacts(client: &RunnerClient, job: &JobLease, workspace: &Path) -> Result<()> {
    let canonical_workspace = tokio::fs::canonicalize(workspace).await?;
    for relative in &job.artifact_paths {
        let path = workspace.join(relative);
        if !path.starts_with(workspace) || !path.exists() {
            continue;
        }
        let mut pending = vec![path];
        while let Some(current) = pending.pop() {
            let metadata = tokio::fs::symlink_metadata(&current).await?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            let canonical_current = tokio::fs::canonicalize(&current).await?;
            if !canonical_current.starts_with(&canonical_workspace) {
                bail!("refusing to upload an artifact outside the job workspace")
            }
            if metadata.is_dir() {
                let mut entries = tokio::fs::read_dir(&current).await?;
                while let Some(entry) = entries.next_entry().await? {
                    pending.push(entry.path());
                }
            } else if metadata.is_file() {
                let name = current
                    .strip_prefix(workspace)?
                    .to_string_lossy()
                    .replace('\\', "/");
                client.artifact(job, &name, &current).await?;
            }
        }
    }
    Ok(())
}

#[cfg(windows)]
async fn kill_tree(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status()
        .await;
}
#[cfg(not(windows))]
async fn kill_tree(pid: u32) {
    let _ = Command::new("pkill")
        .args(["-TERM", "-P", &pid.to_string()])
        .status()
        .await;
    let _ = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status()
        .await;
}
