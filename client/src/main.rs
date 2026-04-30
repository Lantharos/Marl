mod cli;
mod collaborator_commands;
mod collaborators;
mod http;
mod spinner;

fn main() -> anyhow::Result<()> {
    cli::run()
}
