use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

use crate::auth_commands::{login, whoami};
use crate::remote::RemoteOpts;
use crate::ci_commands::{self, CiCommands};
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
        #[command(flatten)]
        remote: RemoteOpts,
        #[arg(long, default_value = "pig", hide = true)]
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
        #[command(flatten)]
        remote: RemoteOpts,
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
        #[command(flatten)]
        remote: RemoteOpts,
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
        #[command(flatten)]
        remote: RemoteOpts,
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
        #[command(flatten)]
        remote: RemoteOpts,
        #[arg(long, default_value = "pig")]
        pig: String,
    },
    Whoami,
    Ci {
        #[command(subcommand)]
        command: CiCommands,
    },
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
        #[command(flatten)]
        remote: RemoteOpts,
    },
    List {
        #[command(flatten)]
        remote: RemoteOpts,
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
        #[command(flatten)]
        remote: RemoteOpts,
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
            remote,
            pig,
        } => login(token, callback_port, remote, pig),
        Commands::Init {
            target,
            target_flag,
            tenant,
            project,
            new_tenant,
            folder,
            remote,
            pig,
        } => project_commands::init(
            target,
            target_flag,
            tenant,
            project,
            new_tenant,
            folder,
            remote.resolve(),
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
            remote,
            pig,
        } => fork_commands::fork(
            source,
            target,
            tenant,
            project,
            mode,
            workspace,
            yes,
            no_sync,
            remote.resolve(),
            pig,
        ),
        Commands::Clone {
            source,
            path,
            workspace,
            snapshot,
            include,
            force,
            remote,
        } => clone_commands::clone_project(
            source,
            path,
            workspace,
            snapshot,
            include,
            force,
            remote.remote_url,
            remote.port,
        ),
        Commands::Sendwork {
            title,
            message,
            workspace,
            yes,
            remote,
            pig,
        } => fork_commands::sendwork(title, message, workspace, yes, remote.resolve(), pig),
        Commands::Whoami => whoami(),
        Commands::Ci { command } => ci_commands::run(command),
        Commands::Project { command } => match command {
            ProjectCommands::Create {
                target,
                target_flag,
                tenant,
                project,
                new_tenant,
                folder,
                remote,
            } => project_commands::create_project_command(
                target,
                target_flag,
                tenant,
                project,
                new_tenant,
                folder,
                remote.resolve(),
            ),
            ProjectCommands::List { remote } => project_commands::list_projects(&remote.resolve()),
            ProjectCommands::Collaborators { command } => project_collaborators(command),
        },
        Commands::Tenant { command } => match command {
            TenantCommands::New {
                name,
                name_flag,
                remote,
            } => project_commands::create_tenant_command(name, name_flag, remote.resolve()),
            TenantCommands::Collaborators { command } => tenant_collaborators(command),
        },
        Commands::Leaf { command } => leaf_commands::run(command),
    }
}
