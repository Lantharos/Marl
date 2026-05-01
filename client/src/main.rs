mod cli;
mod collaborator_commands;
mod collaborators;
mod fork_commands;
mod http;
mod interactive;
mod project_commands;
mod spinner;

fn main() -> anyhow::Result<()> {
    cli::run()
}
