mod cli;
mod http;
mod spinner;

fn main() -> anyhow::Result<()> {
    cli::run()
}
