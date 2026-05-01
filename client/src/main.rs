mod cli;
mod collaborator_commands;
mod collaborators;
mod http;
mod interactive;
mod project_commands;
mod spinner;

fn main() -> anyhow::Result<()> {
    cli::run()
}
