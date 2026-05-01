use std::process::Command;

use anyhow::{Context, Result, bail};
use clap::ValueEnum;
use reqwest::blocking::Client;
use serde::Deserialize;
use sty_protocol::{
    ForkProjectRequest, ForkProjectResponse, SendWorkRequest, SendWorkResponse, validate_segment,
    validate_target,
};

use crate::cli::load_config;
use crate::http::{RequestBuilderExt, response_error};
use crate::interactive;
use crate::project_commands;

#[derive(Clone, Debug, ValueEnum)]
pub(crate) enum ForkModeArg {
    Contribute,
    Detached,
}

impl ForkModeArg {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Contribute => "contribute",
            Self::Detached => "detached",
        }
    }
}

#[derive(Deserialize)]
struct PigRemoteInfo {
    tenant: String,
    project: String,
    configured: bool,
}

#[derive(Deserialize)]
struct PigWorkStatus {
    current: String,
}

pub(crate) fn fork(
    source: String,
    target: Option<String>,
    tenant: Option<String>,
    project: Option<String>,
    mode: Option<ForkModeArg>,
    workspace: Option<String>,
    yes: bool,
    no_sync: bool,
    remote_url: String,
    pig: String,
) -> Result<()> {
    let (source_tenant, source_project) = validate_target(&source)?;
    let mode = resolve_mode(mode, yes)?;
    let target = resolve_target(
        target,
        tenant,
        project,
        source_project,
        mode.as_str(),
        yes,
        &remote_url,
    )?;
    let workspace = resolve_workspace(workspace, &target, mode.as_str(), yes)?;
    let response = create_fork(
        &remote_url,
        ForkProjectRequest {
            source_tenant: source_tenant.to_string(),
            source_project: source_project.to_string(),
            target_tenant: target.tenant.clone(),
            target_project: target.project.clone(),
            mode: mode.as_str().to_string(),
            workspace: workspace.clone(),
        },
    )?;
    println!(
        "Forked {}/{} to {}/{}",
        response.source.tenant,
        response.source.project,
        response.target.tenant,
        response.target.project
    );
    if no_sync {
        print_sync_hint(&response);
        return Ok(());
    }
    let should_sync =
        yes || interactive::confirm("Connect this directory to the fork and sync it now?", true)?;
    if should_sync {
        sync_fork_directory(&pig, &remote_url, &response, yes)?;
    } else {
        print_sync_hint(&response);
    }
    Ok(())
}

pub(crate) fn sendwork(
    title: Option<String>,
    message: Option<String>,
    workspace: Option<String>,
    yes: bool,
    remote_url: String,
    pig: String,
) -> Result<()> {
    let remote = pig_json::<PigRemoteInfo>(&pig, &["--json", "remote", "show"])?;
    if !remote.configured {
        bail!("this directory is not connected to a sty project");
    }
    let workspace = match workspace {
        Some(workspace) => {
            validate_segment(&workspace)?;
            workspace
        }
        None => pig_json::<PigWorkStatus>(&pig, &["--json", "work", "status"])?.current,
    };
    let title = match title {
        Some(title) => title,
        None if yes => format!("Work from {workspace}"),
        None => interactive::prompt_text("Title", Some(format!("Work from {workspace}")))?,
    };
    let message = match message {
        Some(message) => message,
        None if yes => String::new(),
        None => interactive::prompt_text("Message", None)?,
    };
    if title.trim().is_empty() {
        bail!("sendwork title is required");
    }
    let should_send = yes
        || interactive::confirm(
            "Sync this workspace and send it to the parent project?",
            true,
        )?;
    if !should_send {
        return Ok(());
    }
    run_pig(&pig, &["sync"])?;
    let response = send_work(
        &remote_url,
        &remote.tenant,
        &remote.project,
        SendWorkRequest {
            workspace,
            title,
            message,
        },
    )?;
    println!(
        "Sent {} to {}/{} as ready work",
        response.workspace, response.source.tenant, response.source.project
    );
    Ok(())
}

struct TargetProject {
    tenant: String,
    project: String,
}

fn resolve_mode(mode: Option<ForkModeArg>, yes: bool) -> Result<ForkModeArg> {
    if let Some(mode) = mode {
        return Ok(mode);
    }
    if yes {
        return Ok(ForkModeArg::Contribute);
    }
    let options = [
        "Contribute back to the parent later",
        "Copy into my tenant as an independent project",
    ];
    match interactive::select("Fork mode", &options, 0)? {
        0 => Ok(ForkModeArg::Contribute),
        _ => Ok(ForkModeArg::Detached),
    }
}

fn resolve_target(
    target: Option<String>,
    tenant: Option<String>,
    project: Option<String>,
    source_project: &str,
    mode: &str,
    yes: bool,
    remote_url: &str,
) -> Result<TargetProject> {
    if let Some(target) = target {
        if tenant.is_some() || project.is_some() {
            bail!("--target cannot be combined with --tenant or --project");
        }
        let (tenant, project) = validate_target(&target)?;
        return Ok(TargetProject {
            tenant: tenant.to_string(),
            project: project.to_string(),
        });
    }

    let tenant = match tenant {
        Some(tenant) => {
            validate_segment(&tenant)?;
            tenant
        }
        None if yes => project_commands::fetch_tenants(remote_url)?
            .into_iter()
            .next()
            .map(|tenant| tenant.name)
            .context("no tenants available")?,
        None => interactive::choose_existing_tenant(&project_commands::fetch_tenants(remote_url)?)?,
    };
    let default_project = if mode == "contribute" {
        format!("{source_project}-fork")
    } else {
        source_project.to_string()
    };
    let project = match project {
        Some(project) => {
            validate_segment(&project)?;
            project
        }
        None if yes => default_project,
        None => interactive::prompt_project_name_with_default(default_project)?,
    };
    Ok(TargetProject { tenant, project })
}

fn resolve_workspace(
    workspace: Option<String>,
    target: &TargetProject,
    mode: &str,
    yes: bool,
) -> Result<Option<String>> {
    if mode == "detached" {
        if workspace.is_some() {
            bail!("--workspace only applies to contribution forks");
        }
        return Ok(None);
    }
    let default = format!("fork-{}-{}", target.tenant, target.project);
    let workspace = match workspace {
        Some(workspace) => workspace,
        None if yes => default,
        None => interactive::prompt_text("Workspace", Some(default))?,
    };
    validate_segment(&workspace)?;
    Ok(Some(workspace))
}

fn create_fork(remote_url: &str, body: ForkProjectRequest) -> Result<ForkProjectResponse> {
    let config = load_config()?;
    let url = format!("{}/v1/forks", remote_url.trim_end_matches('/'));
    let response = Client::new()
        .post(url)
        .bearer_auth(config.token)
        .json(&body)
        .send_request("Forking project")?;
    if !response.status().is_success() {
        bail!("fork failed with status {}", response_error(response));
    }
    response.json().map_err(Into::into)
}

fn send_work(
    remote_url: &str,
    tenant: &str,
    project: &str,
    body: SendWorkRequest,
) -> Result<SendWorkResponse> {
    let config = load_config()?;
    let url = format!(
        "{}/v1/tenants/{}/projects/{}/sendwork",
        remote_url.trim_end_matches('/'),
        tenant,
        project
    );
    let response = Client::new()
        .post(url)
        .bearer_auth(config.token)
        .json(&body)
        .send_request("Sending work")?;
    if !response.status().is_success() {
        bail!("sendwork failed with status {}", response_error(response));
    }
    response.json().map_err(Into::into)
}

fn sync_fork_directory(
    pig: &str,
    remote_url: &str,
    fork: &ForkProjectResponse,
    yes: bool,
) -> Result<()> {
    let target = format!("{}/{}", fork.target.tenant, fork.target.project);
    confirm_remote_replacement(pig, &target, yes)?;
    run_pig(pig, &["remote", "add", &target, "--remote-url", remote_url])?;
    run_pig(pig, &["work", "switch", "main"])?;
    run_pig(pig, &["sync"])?;
    if let Some(workspace) = fork.workspace.as_deref() {
        if run_pig(pig, &["work", "new", workspace, "--from", "main"]).is_err() {
            run_pig(pig, &["work", "switch", workspace])?;
        } else {
            run_pig(pig, &["work", "switch", workspace])?;
        }
        run_pig(pig, &["sync"])?;
    }
    Ok(())
}

fn confirm_remote_replacement(pig: &str, target: &str, yes: bool) -> Result<()> {
    let Ok(remote) = pig_json::<PigRemoteInfo>(pig, &["--json", "remote", "show"]) else {
        return Ok(());
    };
    if !remote.configured || format!("{}/{}", remote.tenant, remote.project) == target {
        return Ok(());
    }
    if yes
        || interactive::confirm(
            &format!(
                "Replace this directory's sty remote {}/{} with {target}?",
                remote.tenant, remote.project
            ),
            false,
        )?
    {
        return Ok(());
    }
    bail!("leaving existing sty remote unchanged")
}

fn print_sync_hint(fork: &ForkProjectResponse) {
    println!(
        "To sync later, run `pig remote add {}/{} --remote-url <remote>` then `pig sync`.",
        fork.target.tenant, fork.target.project
    );
}

fn run_pig(pig: &str, args: &[&str]) -> Result<()> {
    let status = Command::new(pig)
        .args(args)
        .status()
        .with_context(|| format!("failed to run `{pig}`"))?;
    if !status.success() {
        bail!("`{pig} {}` failed", args.join(" "));
    }
    Ok(())
}

fn pig_json<T>(pig: &str, args: &[&str]) -> Result<T>
where
    T: for<'de> Deserialize<'de>,
{
    let output = Command::new(pig)
        .args(args)
        .output()
        .with_context(|| format!("failed to run `{pig}`"))?;
    if !output.status.success() {
        bail!("`{pig} {}` failed", args.join(" "));
    }
    serde_json::from_slice(&output.stdout).map_err(Into::into)
}
