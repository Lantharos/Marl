use anyhow::{Result, bail};
use clap::Subcommand;
use sty_protocol::{validate_segment, validate_target};

use crate::auth_commands::load_config;
use crate::collaborators;

#[derive(Subcommand)]
pub(crate) enum TenantCollaboratorCommands {
    List {
        tenant: String,
        #[arg(long, default_value = super::cli::DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Add {
        tenant: String,
        user: String,
        #[arg(long)]
        role: String,
        #[arg(long, default_value = super::cli::DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Update {
        tenant: String,
        user: String,
        #[arg(long)]
        role: String,
        #[arg(long, default_value = super::cli::DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Remove {
        tenant: String,
        user: String,
        #[arg(long, default_value = super::cli::DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
}

#[derive(Subcommand)]
pub(crate) enum ProjectCollaboratorCommands {
    List {
        target: String,
        #[arg(long, default_value = super::cli::DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Add {
        target: String,
        user: String,
        #[arg(long)]
        role: String,
        #[arg(long, default_value = super::cli::DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Update {
        target: String,
        user: String,
        #[arg(long)]
        role: String,
        #[arg(long, default_value = super::cli::DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Remove {
        target: String,
        user: String,
        #[arg(long, default_value = super::cli::DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
}

pub(crate) fn tenant_collaborators(command: TenantCollaboratorCommands) -> Result<()> {
    let config = load_config()?;
    match command {
        TenantCollaboratorCommands::List { tenant, remote_url } => {
            validate_segment(&tenant)?;
            collaborators::list_tenant(&remote_url, &config.token, &tenant)
        }
        TenantCollaboratorCommands::Add {
            tenant,
            user,
            role,
            remote_url,
        } => {
            validate_segment(&tenant)?;
            let role = collaborator_role(&role)?;
            collaborators::add_tenant(&remote_url, &config.token, &tenant, &user, &role)
        }
        TenantCollaboratorCommands::Update {
            tenant,
            user,
            role,
            remote_url,
        } => {
            validate_segment(&tenant)?;
            let role = collaborator_role(&role)?;
            collaborators::update_tenant(&remote_url, &config.token, &tenant, &user, &role)
        }
        TenantCollaboratorCommands::Remove {
            tenant,
            user,
            remote_url,
        } => {
            validate_segment(&tenant)?;
            collaborators::remove_tenant(&remote_url, &config.token, &tenant, &user)
        }
    }
}

pub(crate) fn project_collaborators(command: ProjectCollaboratorCommands) -> Result<()> {
    let config = load_config()?;
    match command {
        ProjectCollaboratorCommands::List { target, remote_url } => {
            let (tenant, project) = validate_target(&target)?;
            collaborators::list_project(&remote_url, &config.token, tenant, project)
        }
        ProjectCollaboratorCommands::Add {
            target,
            user,
            role,
            remote_url,
        } => {
            let (tenant, project) = validate_target(&target)?;
            let role = collaborator_role(&role)?;
            collaborators::add_project(&remote_url, &config.token, tenant, project, &user, &role)
        }
        ProjectCollaboratorCommands::Update {
            target,
            user,
            role,
            remote_url,
        } => {
            let (tenant, project) = validate_target(&target)?;
            let role = collaborator_role(&role)?;
            collaborators::update_project(&remote_url, &config.token, tenant, project, &user, &role)
        }
        ProjectCollaboratorCommands::Remove {
            target,
            user,
            remote_url,
        } => {
            let (tenant, project) = validate_target(&target)?;
            collaborators::remove_project(&remote_url, &config.token, tenant, project, &user)
        }
    }
}

fn collaborator_role(role: &str) -> Result<String> {
    let role = role.trim().to_ascii_lowercase();
    match role.as_str() {
        "viewer" | "contributor" | "maintainer" => Ok(role),
        "owner" => bail!("owner is not an assignable collaborator role"),
        _ => bail!("role must be viewer, contributor, or maintainer"),
    }
}
