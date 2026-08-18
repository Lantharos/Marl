use crate::{
    client::RunnerClient,
    config::ensure_job_path,
    docker::DockerSandbox,
    models::{JobLease, JobStep, RunnerConfig},
    process::Command,
};
use anyhow::{Context, Result, bail};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::AsyncReadExt,
    sync::{Semaphore, mpsc},
    task::JoinSet,
    time,
};

const LOG_CHUNK_BYTES: usize = 512 * 1024;
const LOG_FLUSH_INTERVAL: Duration = Duration::from_millis(500);

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
                .complete(job, "canceled", 130, "Canceled by Marl.")
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
        format!("marl · {} #{}\n", job.run.name, job.run.number),
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
    upload_text(
        client,
        job,
        &mut sequence,
        format!("container: {}\n", job.runtime.image),
    )
    .await?;
    let sandbox = DockerSandbox::create(job, &workspace, &cache).await?;
    let deadline = time::Instant::now() + Duration::from_secs(job.runtime.timeout_minutes * 60);
    let execution = async {
        let mut outcome = Outcome::Success;
        for step in &job.steps {
            upload_text(
                client,
                job,
                &mut sequence,
                format!("\n── {} ──\n", step.name),
            )
            .await?;
            let remaining = deadline.saturating_duration_since(time::Instant::now());
            match execute_step(client, job, step, &sandbox, remaining, &mut sequence).await? {
                Outcome::Success => {}
                Outcome::Failure(code) if step.continue_on_error => {
                    upload_text(
                        client,
                        job,
                        &mut sequence,
                        format!("Step failed with exit code {code}; continuing.\n"),
                    )
                    .await?;
                }
                step_outcome => {
                    outcome = step_outcome;
                    break;
                }
            }
        }
        Ok::<Outcome, anyhow::Error>(outcome)
    }
    .await;
    sandbox.remove().await;
    let outcome = execution?;
    upload_artifacts(client, job, &workspace).await?;
    Ok(outcome)
}

async fn execute_step(
    client: &RunnerClient,
    job: &JobLease,
    step: &JobStep,
    sandbox: &DockerSandbox,
    job_remaining: Duration,
    sequence: &mut u64,
) -> Result<Outcome> {
    let mut child = sandbox.step(job, step)?;
    let stdout = child.stdout.take().context("step stdout unavailable")?;
    let stderr = child.stderr.take().context("step stderr unavailable")?;
    let (sender, mut receiver) = mpsc::channel::<Vec<u8>>(32);
    tokio::spawn(pump(stdout, sender.clone()));
    tokio::spawn(pump(stderr, sender.clone()));
    drop(sender);
    let mut renewal = time::interval(Duration::from_secs(15));
    renewal.tick().await;
    let mut flush = time::interval(LOG_FLUSH_INTERVAL);
    flush.set_missed_tick_behavior(time::MissedTickBehavior::Delay);
    flush.tick().await;
    let mut pending = Vec::with_capacity(LOG_CHUNK_BYTES);
    let step_limit = step
        .timeout_minutes
        .map(|minutes| Duration::from_secs(minutes * 60))
        .unwrap_or(job_remaining)
        .min(job_remaining);
    let timeout = time::sleep(step_limit);
    tokio::pin!(timeout);
    let mut waiting = Box::pin(child.wait());
    let status = loop {
        tokio::select! {
            status = &mut waiting => break status?,
            chunk = receiver.recv() => if let Some(chunk) = chunk {
                pending.extend_from_slice(&chunk);
                if pending.len() >= LOG_CHUNK_BYTES { upload_pending(client, job, sequence, &mut pending).await?; }
            },
            _ = flush.tick() => upload_pending(client, job, sequence, &mut pending).await?,
            _ = renewal.tick() => {
                let lease = client.renew(job).await?;
                if lease.canceled {
                    sandbox.kill().await;
                    let _ = waiting.await;
                    while let Some(chunk) = receiver.recv().await { pending.extend_from_slice(&chunk); }
                    upload_pending(client, job, sequence, &mut pending).await?;
                    return Ok(Outcome::Canceled);
                }
            }
            _ = &mut timeout => {
                sandbox.kill().await;
                let _ = waiting.await;
                while let Some(chunk) = receiver.recv().await { pending.extend_from_slice(&chunk); }
                upload_pending(client, job, sequence, &mut pending).await?;
                upload_text(client, job, sequence, format!("Step timed out after {} seconds.\n", step_limit.as_secs())).await?;
                return Ok(Outcome::Failure(124));
            }
        }
    };
    while let Some(chunk) = receiver.recv().await {
        pending.extend_from_slice(&chunk);
    }
    upload_pending(client, job, sequence, &mut pending).await?;
    Ok(if status.success() {
        Outcome::Success
    } else {
        Outcome::Failure(status.code().unwrap_or(1))
    })
}

async fn upload_pending(
    client: &RunnerClient,
    job: &JobLease,
    sequence: &mut u64,
    pending: &mut Vec<u8>,
) -> Result<()> {
    if pending.is_empty() {
        return Ok(());
    }
    client.log(job, *sequence, std::mem::take(pending)).await?;
    *sequence += 1;
    pending.reserve(LOG_CHUNK_BYTES);
    Ok(())
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
    let mut uploaded = HashSet::new();
    for relative in &job.artifact_paths {
        let pattern = workspace
            .join(relative)
            .to_string_lossy()
            .replace('\\', "/");
        let mut pending = glob::glob(&pattern)?
            .filter_map(Result::ok)
            .collect::<Vec<_>>();
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
                if uploaded.insert(name.clone()) {
                    client.artifact(job, &name, &current).await?;
                }
            }
        }
    }
    Ok(())
}
