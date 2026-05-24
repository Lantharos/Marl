use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Result, bail};
use reqwest::blocking::Client;
use reqwest::blocking::Response;
use serde::Deserialize;
use sty_protocol::{Paginated, validate_target};

use crate::auth_commands::{DEFAULT_REMOTE_URL, load_config};
use crate::http::{RequestBuilderExt, response_error};

#[derive(clap::Subcommand)]
pub(crate) enum CiCommands {
    Runner {
        #[command(subcommand)]
        command: CiRunnerCommands,
    },
    Jobs {
        target: String,
        #[arg(long)]
        workspace: Option<String>,
        #[arg(long, default_value_t = 50)]
        limit: u32,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Logs {
        target: String,
        job: String,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Artifacts {
        target: String,
        job: String,
        #[arg(long)]
        download: Option<String>,
        #[arg(short, long)]
        output: Option<PathBuf>,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
}

#[derive(clap::Subcommand)]
pub(crate) enum CiRunnerCommands {
    New {
        target: String,
        name: String,
        #[arg(long, default_value_t = 1)]
        concurrency: u32,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    List {
        target: String,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Delete {
        target: String,
        id: String,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
}

#[derive(Deserialize)]
struct CiRunner {
    id: String,
    name: String,
    prefix: String,
    concurrency: u32,
    token: Option<String>,
    last_seen_at: Option<String>,
    disabled_at: Option<String>,
}

#[derive(Deserialize)]
struct CiJob {
    id: String,
    workspace: String,
    head: String,
    name: String,
    status: String,
    conclusion: Option<String>,
    runner_id: Option<String>,
    updated_at: String,
}

#[derive(Deserialize)]
struct CiLogLine {
    seq: u64,
    stream: String,
    text: String,
}

#[derive(Deserialize)]
struct CiLogsResponse {
    logs: Vec<CiLogLine>,
}

#[derive(Deserialize)]
struct CiArtifact {
    id: String,
    name: String,
    size: u64,
    digest: String,
    created_at: String,
}

#[derive(Deserialize)]
struct CiArtifactsResponse {
    artifacts: Vec<CiArtifact>,
}

pub(crate) fn run(command: CiCommands) -> Result<()> {
    match command {
        CiCommands::Runner { command } => match command {
            CiRunnerCommands::New {
                target,
                name,
                concurrency,
                remote_url,
            } => create_runner(&remote_url, &target, &name, concurrency),
            CiRunnerCommands::List { target, remote_url } => list_runners(&remote_url, &target),
            CiRunnerCommands::Delete {
                target,
                id,
                remote_url,
            } => delete_runner(&remote_url, &target, &id),
        },
        CiCommands::Jobs {
            target,
            workspace,
            limit,
            remote_url,
        } => list_jobs(&remote_url, &target, workspace.as_deref(), limit),
        CiCommands::Logs {
            target,
            job,
            remote_url,
        } => show_logs(&remote_url, &target, &job),
        CiCommands::Artifacts {
            target,
            job,
            download,
            output,
            remote_url,
        } => match download {
            Some(artifact) => {
                download_artifact(&remote_url, &target, &job, &artifact, output.as_deref())
            }
            None => list_artifacts(&remote_url, &target, &job),
        },
    }
}

fn create_runner(remote_url: &str, target: &str, name: &str, concurrency: u32) -> Result<()> {
    let (tenant, project) = validate_target(target)?;
    let config = load_config()?;
    let url = project_url(remote_url, tenant, project, "/ci/runners");
    let response = Client::new()
        .post(url)
        .bearer_auth(config.token)
        .json(&serde_json::json!({ "name": name, "concurrency": concurrency.clamp(1, 32) }))
        .send_request("Creating CI runner")?;
    if !response.status().is_success() {
        bail!(
            "ci runner create failed with status {}",
            response_error(response)
        );
    }
    let runner = response.json::<CiRunner>()?;
    println!("Runner: {} ({})", runner.name, runner.id);
    if let Some(token) = runner.token {
        println!("Token: {token}");
        println!("Run: STY_CI_TOKEN={token} pig ci run");
    }
    Ok(())
}

fn list_runners(remote_url: &str, target: &str) -> Result<()> {
    let (tenant, project) = validate_target(target)?;
    let config = load_config()?;
    let url = project_url(remote_url, tenant, project, "/ci/runners");
    let response = Client::new()
        .get(url)
        .bearer_auth(config.token)
        .send_request("Fetching CI runners")?;
    if !response.status().is_success() {
        bail!(
            "ci runner list failed with status {}",
            response_error(response)
        );
    }
    let runners = response.json::<Paginated<CiRunner>>()?.items;
    if runners.is_empty() {
        println!("No CI runners");
        return Ok(());
    }
    for runner in runners {
        let state = if runner.disabled_at.is_some() {
            "disabled".to_string()
        } else {
            format!(
                "last seen {}",
                runner.last_seen_at.as_deref().unwrap_or("never")
            )
        };
        println!(
            "{}  {}...  {}  concurrency {}  {}",
            runner.id, runner.prefix, runner.name, runner.concurrency, state
        );
    }
    Ok(())
}

fn delete_runner(remote_url: &str, target: &str, id: &str) -> Result<()> {
    let (tenant, project) = validate_target(target)?;
    let config = load_config()?;
    let url = project_url(remote_url, tenant, project, &format!("/ci/runners/{id}"));
    let response = Client::new()
        .delete(url)
        .bearer_auth(config.token)
        .send_request("Disabling CI runner")?;
    if !response.status().is_success() {
        bail!(
            "ci runner delete failed with status {}",
            response_error(response)
        );
    }
    println!("Disabled runner {id}");
    Ok(())
}

fn list_jobs(remote_url: &str, target: &str, workspace: Option<&str>, limit: u32) -> Result<()> {
    let (tenant, project) = validate_target(target)?;
    let config = load_config()?;
    let mut url = project_url(
        remote_url,
        tenant,
        project,
        &format!("/ci/jobs?limit={limit}"),
    );
    if let Some(workspace) = workspace {
        url.push_str("&workspace=");
        url.push_str(workspace);
    }
    let response = Client::new()
        .get(url)
        .bearer_auth(config.token)
        .send_request("Fetching CI jobs")?;
    if !response.status().is_success() {
        bail!("ci jobs failed with status {}", response_error(response));
    }
    let jobs = response.json::<Paginated<CiJob>>()?.items;
    if jobs.is_empty() {
        println!("No CI jobs");
        return Ok(());
    }
    for job in jobs {
        let result = job.conclusion.as_deref().unwrap_or(&job.status);
        let runner = job.runner_id.as_deref().unwrap_or("-");
        println!(
            "{}  {}  {}  {}  {}  {}  {}",
            job.id,
            job.workspace,
            &job.head[..job.head.len().min(12)],
            job.name,
            result,
            runner,
            job.updated_at
        );
    }
    Ok(())
}

fn show_logs(remote_url: &str, target: &str, job: &str) -> Result<()> {
    let (tenant, project) = validate_target(target)?;
    let config = load_config()?;
    let url = project_url(remote_url, tenant, project, &format!("/ci/jobs/{job}/logs"));
    let response = Client::new()
        .get(url)
        .bearer_auth(config.token)
        .send_request("Fetching CI logs")?;
    if !response.status().is_success() {
        bail!("ci logs failed with status {}", response_error(response));
    }
    for line in response.json::<CiLogsResponse>()?.logs {
        print!("[{} {}] {}", line.seq, line.stream, line.text);
    }
    Ok(())
}

fn list_artifacts(remote_url: &str, target: &str, job: &str) -> Result<()> {
    let (tenant, project) = validate_target(target)?;
    let config = load_config()?;
    let url = project_url(
        remote_url,
        tenant,
        project,
        &format!("/ci/jobs/{job}/artifacts"),
    );
    let response = Client::new()
        .get(url)
        .bearer_auth(config.token)
        .send_request("Fetching CI artifacts")?;
    if !response.status().is_success() {
        bail!(
            "ci artifacts failed with status {}",
            response_error(response)
        );
    }
    let artifacts = response.json::<CiArtifactsResponse>()?.artifacts;
    if artifacts.is_empty() {
        println!("No CI artifacts");
        return Ok(());
    }
    for artifact in artifacts {
        println!(
            "{}  {}  {} bytes  {}  {}",
            artifact.id, artifact.name, artifact.size, artifact.digest, artifact.created_at
        );
    }
    Ok(())
}

fn download_artifact(
    remote_url: &str,
    target: &str,
    job: &str,
    artifact: &str,
    output: Option<&Path>,
) -> Result<()> {
    let (tenant, project) = validate_target(target)?;
    let config = load_config()?;
    let url = project_url(
        remote_url,
        tenant,
        project,
        &format!("/ci/jobs/{job}/artifacts/{artifact}/download"),
    );
    let response = Client::new()
        .get(url)
        .bearer_auth(config.token)
        .send_request("Downloading CI artifact")?;
    if !response.status().is_success() {
        bail!(
            "ci artifact download failed with status {}",
            response_error(response)
        );
    }
    let filename = response_filename(&response).unwrap_or_else(|| artifact.to_string());
    let target_path = match output {
        Some(path) if path.is_dir() => path.join(filename),
        Some(path) => path.to_path_buf(),
        None => PathBuf::from(filename),
    };
    if let Some(parent) = target_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }
    let bytes = response.bytes()?;
    fs::write(&target_path, bytes)?;
    println!("Downloaded {}", target_path.display());
    Ok(())
}

fn response_filename(response: &Response) -> Option<String> {
    let header = response
        .headers()
        .get("content-disposition")?
        .to_str()
        .ok()?;
    header.split(';').find_map(|part| {
        let value = part.trim().strip_prefix("filename=")?;
        let value = value.trim_matches('"').trim();
        if value.is_empty() || value.contains('/') || value.contains('\\') {
            return None;
        }
        Some(value.to_string())
    })
}

fn project_url(remote_url: &str, tenant: &str, project: &str, path: &str) -> String {
    format!(
        "{}/v1/tenants/{tenant}/projects/{project}{path}",
        remote_url.trim_end_matches('/')
    )
}
