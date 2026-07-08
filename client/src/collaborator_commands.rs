use anyhow::{Result, bail};
use clap::Subcommand;
use sty_protocol::{validate_segment, validate_target};

use crate::auth_commands::load_config;
use crate::collaborators;
use crate::remote::RemoteOpts;

#[derive(Subcommand)]
pub(crate) enum TenantCollaboratorCommands {
    List {
        tenant: String,
        #[command(flatten)]
        remote: RemoteOpts,
    },
    Add {
        tenant: String,
        user: String,
        #[arg(long)]
        role: String,
        #[command(flatten)]
        remote: RemoteOpts,
    },
    Update {
        tenant: String,
        user: String,
        #[arg(long)]
        role: String,
        #[command(flatten)]
        remote: RemoteOpts,
    },
    Remove {
        tenant: String,
        user: String,
        #[command(flatten)]
        remote: RemoteOpts,
    },
}

#[derive(Subcommand)]
pub(crate) enum ProjectCollaboratorCommands {
    List {
        target: String,
        #[command(flatten)]
        remote: RemoteOpts,
    },
    Add {
        target: String,
        user: String,
        #[arg(long)]
        role: String,
        #[command(flatten)]
        remote: RemoteOpts,
    },
    Update {
        target: String,
        user: String,
        #[arg(long)]
        role: String,
        #[command(flatten)]
        remote: RemoteOpts,
    },
    Remove {
        target: String,
        user: String,
        #[command(flatten)]
        remote: RemoteOpts,
    },
}

pub(crate) fn tenant_collaborators(command: TenantCollaboratorCommands) -> Result<()> {
    let config = load_config()?;
    match command {
        TenantCollaboratorCommands::List { tenant, remote } => {
            validate_segment(&tenant)?;
            collaborators::list_tenant(&remote.resolve(), &config.token, &tenant)
        }
        TenantCollaboratorCommands::Add {
            tenant,
            user,
            role,
            remote,
        } => {
            validate_segment(&tenant)?;
            let role = collaborator_role(&role)?;
            collaborators::add_tenant(&remote.resolve(), &config.token, &tenant, &user, &role)
        }
        TenantCollaboratorCommands::Update {
            tenant,
            user,
            role,
            remote,
        } => {
            validate_segment(&tenant)?;
            let role = collaborator_role(&role)?;
            collaborators::update_tenant(&remote.resolve(), &config.token, &tenant, &user, &role)
        }
        TenantCollaboratorCommands::Remove {
            tenant,
            user,
            remote,
        } => {
            validate_segment(&tenant)?;
            collaborators::remove_tenant(&remote.resolve(), &config.token, &tenant, &user)
        }
    }
}

pub(crate) fn project_collaborators(command: ProjectCollaboratorCommands) -> Result<()> {
    let config = load_config()?;
    match command {
        ProjectCollaboratorCommands::List { target, remote } => {
            let (tenant, project) = validate_target(&target)?;
            collaborators::list_project(&remote.resolve(), &config.token, tenant, project)
        }
        ProjectCollaboratorCommands::Add {
            target,
            user,
            role,
            remote,
        } => {
            let (tenant, project) = validate_target(&target)?;
            let role = collaborator_role(&role)?;
            collaborators::add_project(
                &remote.resolve(),
                &config.token,
                tenant,
                project,
                &user,
                &role,
            )
        }
        ProjectCollaboratorCommands::Update {
            target,
            user,
            role,
            remote,
        } => {
            let (tenant, project) = validate_target(&target)?;
            let role = collaborator_role(&role)?;
            collaborators::update_project(
                &remote.resolve(),
                &config.token,
                tenant,
                project,
                &user,
                &role,
            )
        }
        ProjectCollaboratorCommands::Remove {
            target,
            user,
            remote,
        } => {
            let (tenant, project) = validate_target(&target)?;
            collaborators::remove_project(
                &remote.resolve(),
                &config.token,
                tenant,
                project,
                &user,
            )
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
