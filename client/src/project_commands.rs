use std::process::Command;

use anyhow::{Context, Result, bail};
use reqwest::blocking::Client;
use sty_protocol::{
    MeResponse, ProjectsResponse, TenantSummary, validate_segment, validate_target,
};

use crate::cli::load_config;
use crate::http::{RequestBuilderExt, response_error};
use crate::interactive::{self, TenantChoice};

struct ProjectTarget {
    tenant: String,
    project: String,
    create_tenant: bool,
}

impl ProjectTarget {
    fn target(&self) -> String {
        format!("{}/{}", self.tenant, self.project)
    }
}

pub(crate) fn init(
    target: Option<String>,
    target_flag: Option<String>,
    tenant: Option<String>,
    project: Option<String>,
    new_tenant: Option<String>,
    remote_url: String,
    pig: String,
) -> Result<()> {
    let target = resolve_project_target(
        target,
        target_flag,
        tenant,
        project,
        new_tenant,
        &remote_url,
    )?;
    if target.create_tenant {
        create_tenant(&target.tenant, &remote_url)?;
    }
    let target = target.target();
    create_project(&target, &remote_url)?;
    let status = Command::new(&pig)
        .args(["remote", "add", &target, "--remote-url", &remote_url])
        .status()
        .with_context(|| format!("failed to run `{pig} remote add`"))?;
    if !status.success() {
        bail!("`{pig} remote add` failed");
    }
    println!("Connected this repo to {target}");
    Ok(())
}

pub(crate) fn create_project_command(
    target: Option<String>,
    target_flag: Option<String>,
    tenant: Option<String>,
    project: Option<String>,
    new_tenant: Option<String>,
    remote_url: String,
) -> Result<()> {
    let target = resolve_project_target(
        target,
        target_flag,
        tenant,
        project,
        new_tenant,
        &remote_url,
    )?;
    if target.create_tenant {
        create_tenant(&target.tenant, &remote_url)?;
    }
    create_project(&target.target(), &remote_url)
}

pub(crate) fn create_tenant_command(
    name: Option<String>,
    name_flag: Option<String>,
    remote_url: String,
) -> Result<()> {
    let name = match resolve_optional_pair(name, name_flag, "tenant name", "--name")? {
        Some(name) => {
            validate_segment(&name)?;
            name
        }
        None => interactive::prompt_tenant_name()?,
    };
    create_tenant(&name, &remote_url)
}

pub(crate) fn list_projects(remote_url: &str) -> Result<()> {
    let config = load_config()?;
    let url = format!("{}/v1/projects", remote_url.trim_end_matches('/'));
    let response = Client::new()
        .get(url)
        .bearer_auth(config.token)
        .send_request("Fetching projects")?;
    if !response.status().is_success() {
        bail!(
            "project list failed with status {}",
            response_error(response)
        );
    }
    let body = response.json::<ProjectsResponse>()?;
    if body.projects.is_empty() {
        println!("No projects");
        return Ok(());
    }
    for project in body.projects {
        println!("{}/{}", project.tenant, project.project);
    }
    Ok(())
}

fn resolve_project_target(
    target: Option<String>,
    target_flag: Option<String>,
    tenant: Option<String>,
    project: Option<String>,
    new_tenant: Option<String>,
    remote_url: &str,
) -> Result<ProjectTarget> {
    let target = resolve_optional_pair(target, target_flag, "target", "--target")?;
    if let Some(target) = target {
        if tenant.is_some() || project.is_some() || new_tenant.is_some() {
            bail!("target cannot be combined with --tenant, --project, or --new-tenant");
        }
        let (tenant, project) = validate_target(&target)?;
        return Ok(ProjectTarget {
            tenant: tenant.to_string(),
            project: project.to_string(),
            create_tenant: false,
        });
    }

    if tenant.is_some() && new_tenant.is_some() {
        bail!("--tenant cannot be combined with --new-tenant");
    }

    let (tenant, create_tenant) = match (tenant, new_tenant) {
        (Some(tenant), None) => {
            validate_segment(&tenant)?;
            (tenant, false)
        }
        (None, Some(tenant)) => {
            validate_segment(&tenant)?;
            (tenant, true)
        }
        (None, None) => {
            interactive::require_prompt("missing tenant; pass --tenant or --new-tenant")?;
            match interactive::choose_tenant(&fetch_tenants(remote_url)?)? {
                TenantChoice::Existing(tenant) => (tenant, false),
                TenantChoice::New(tenant) => (tenant, true),
            }
        }
        (Some(_), Some(_)) => unreachable!(),
    };

    let project = match project {
        Some(project) => {
            validate_segment(&project)?;
            project
        }
        None => {
            interactive::require_prompt("missing project; pass --project")?;
            interactive::prompt_project_name()?
        }
    };

    Ok(ProjectTarget {
        tenant,
        project,
        create_tenant,
    })
}

fn resolve_optional_pair(
    positional: Option<String>,
    flag: Option<String>,
    label: &str,
    flag_name: &str,
) -> Result<Option<String>> {
    match (positional, flag) {
        (Some(_), Some(_)) => {
            bail!("{label} cannot be provided both positionally and as {flag_name}")
        }
        (Some(value), None) | (None, Some(value)) => Ok(Some(value)),
        (None, None) => Ok(None),
    }
}

fn fetch_tenants(remote_url: &str) -> Result<Vec<TenantSummary>> {
    let config = load_config()?;
    let url = format!("{}/v1/me", remote_url.trim_end_matches('/'));
    let response = Client::new()
        .get(url)
        .bearer_auth(config.token)
        .send_request("Fetching tenants")?;
    if !response.status().is_success() {
        bail!(
            "tenant list failed with status {}",
            response_error(response)
        );
    }
    Ok(response.json::<MeResponse>()?.tenants)
}

fn create_project(target: &str, remote_url: &str) -> Result<()> {
    let (tenant, project) = validate_target(target)?;
    let config = load_config()?;
    let url = format!(
        "{}/v1/tenants/{}/projects/{}",
        remote_url.trim_end_matches('/'),
        tenant,
        project
    );
    let response = Client::new()
        .post(url)
        .bearer_auth(config.token)
        .json(&serde_json::json!({}))
        .send_request("Creating project")?;
    if !response.status().is_success() {
        bail!(
            "project create failed with status {}",
            response_error(response)
        );
    }
    println!("Project ready: {target}");
    Ok(())
}

fn create_tenant(name: &str, remote_url: &str) -> Result<()> {
    validate_segment(name)?;
    let config = load_config()?;
    let url = format!("{}/v1/orgs", remote_url.trim_end_matches('/'));
    let response = Client::new()
        .post(url)
        .bearer_auth(config.token)
        .json(&serde_json::json!({ "name": name }))
        .send_request("Creating tenant")?;
    if !response.status().is_success() {
        bail!(
            "tenant create failed with status {}",
            response_error(response)
        );
    }
    println!("Tenant ready: {name}");
    Ok(())
}
