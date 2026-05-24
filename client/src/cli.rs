use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

pub(crate) use crate::auth_commands::DEFAULT_REMOTE_URL;
use crate::auth_commands::{login, whoami};
use crate::clone_commands;
use crate::collaborator_commands::{
    ProjectCollaboratorCommands, TenantCollaboratorCommands, project_collaborators,
    tenant_collaborators,
};
use crate::fork_commands::{self, ForkModeArg};
use crate::leaf_commands::{self, LeafCommands};
use crate::project_commands;

#[derive(Parser)]
#[command(name = "sty")]
#[command(about = "Hosted and CLI layer for PIG projects")]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Login {
        #[arg(long)]
        token: Option<String>,
        #[arg(long, default_value_t = 7390)]
        callback_port: u16,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
        #[arg(long, default_value = "pig")]
        pig: String,
    },
    Init {
        #[arg(value_name = "TARGET")]
        target: Option<String>,
        #[arg(long = "target", value_name = "TARGET")]
        target_flag: Option<String>,
        #[arg(long)]
        tenant: Option<String>,
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        new_tenant: Option<String>,
        #[arg(long)]
        folder: Option<String>,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
        #[arg(long, default_value = "pig")]
        pig: String,
    },
    Fork {
        source: String,
        #[arg(long = "target", value_name = "TARGET")]
        target: Option<String>,
        #[arg(long)]
        tenant: Option<String>,
        #[arg(long)]
        project: Option<String>,
        #[arg(long, value_enum)]
        mode: Option<ForkModeArg>,
        #[arg(long)]
        workspace: Option<String>,
        #[arg(long)]
        yes: bool,
        #[arg(long)]
        no_sync: bool,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
        #[arg(long, default_value = "pig")]
        pig: String,
    },
    Clone {
        source: String,
        path: Option<PathBuf>,
        #[arg(long, default_value = "main")]
        workspace: String,
        #[arg(long)]
        snapshot: Option<String>,
        #[arg(long = "include", value_name = "PATH")]
        include: Option<String>,
        #[arg(long)]
        force: bool,
        #[arg(long)]
        remote_url: Option<String>,
    },
    #[command(alias = "sw")]
    Sendwork {
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        message: Option<String>,
        #[arg(long)]
        workspace: Option<String>,
        #[arg(long)]
        yes: bool,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
        #[arg(long, default_value = "pig")]
        pig: String,
    },
    Whoami,
    Project {
        #[command(subcommand)]
        command: ProjectCommands,
    },
    Tenant {
        #[command(subcommand)]
        command: TenantCommands,
    },
    #[command(alias = "leaves")]
    Leaf {
        #[command(subcommand)]
        command: LeafCommands,
    },
}

#[derive(Subcommand)]
enum ProjectCommands {
    Create {
        #[arg(value_name = "TARGET")]
        target: Option<String>,
        #[arg(long = "target", value_name = "TARGET")]
        target_flag: Option<String>,
        #[arg(long)]
        tenant: Option<String>,
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        new_tenant: Option<String>,
        #[arg(long)]
        folder: Option<String>,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    List {
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Collaborators {
        #[command(subcommand)]
        command: ProjectCollaboratorCommands,
    },
}

#[derive(Subcommand)]
enum TenantCommands {
    New {
        #[arg(value_name = "NAME")]
        name: Option<String>,
        #[arg(long = "name", value_name = "NAME")]
        name_flag: Option<String>,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Collaborators {
        #[command(subcommand)]
        command: TenantCollaboratorCommands,
    },
}

pub fn run() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Login {
            token,
            callback_port,
            remote_url,
            pig,
        } => login(token, callback_port, remote_url, pig),
        Commands::Init {
            target,
            target_flag,
            tenant,
            project,
            new_tenant,
            folder,
            remote_url,
            pig,
        } => project_commands::init(
            target,
            target_flag,
            tenant,
            project,
            new_tenant,
            folder,
            remote_url,
            pig,
        ),
        Commands::Fork {
            source,
            target,
            tenant,
            project,
            mode,
            workspace,
            yes,
            no_sync,
            remote_url,
            pig,
        } => fork_commands::fork(
            source, target, tenant, project, mode, workspace, yes, no_sync, remote_url, pig,
        ),
        Commands::Clone {
            source,
            path,
            workspace,
            snapshot,
            include,
            force,
            remote_url,
        } => clone_commands::clone_project(
            source, path, workspace, snapshot, include, force, remote_url,
        ),
        Commands::Sendwork {
            title,
            message,
            workspace,
            yes,
            remote_url,
            pig,
        } => fork_commands::sendwork(title, message, workspace, yes, remote_url, pig),
        Commands::Whoami => whoami(),
        Commands::Project { command } => match command {
            ProjectCommands::Create {
                target,
                target_flag,
                tenant,
                project,
                new_tenant,
                folder,
                remote_url,
            } => project_commands::create_project_command(
                target,
                target_flag,
                tenant,
                project,
                new_tenant,
                folder,
                remote_url,
            ),
            ProjectCommands::List { remote_url } => project_commands::list_projects(&remote_url),
            ProjectCommands::Collaborators { command } => project_collaborators(command),
        },
        Commands::Tenant { command } => match command {
            TenantCommands::New {
                name,
                name_flag,
                remote_url,
            } => project_commands::create_tenant_command(name, name_flag, remote_url),
            TenantCommands::Collaborators { command } => tenant_collaborators(command),
        },
        Commands::Leaf { command } => leaf_commands::run(command),
    }
}
