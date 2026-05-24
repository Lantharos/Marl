mod auth_commands;
mod ci_commands;
mod cli;
mod clone_commands;
mod collaborator_commands;
mod collaborators;
mod fork_commands;
mod http;
mod interactive;
mod leaf_commands;
mod project_commands;
mod spinner;

fn main() -> anyhow::Result<()> {
    cli::run()
}
