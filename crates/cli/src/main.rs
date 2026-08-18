use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde::Serialize;
use std::path::{Path, PathBuf};
use repository::Repository;

#[derive(Parser)]
#[command(
    name = "marl",
    version,
    about = "Work with Marl repositories and runners"
)]
struct Cli {
    #[arg(long, global = true, value_name = "PATH", default_value = ".")]
    repository: PathBuf,
    #[arg(long, global = true, help = "Print machine-readable JSON")]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Status,
    Log {
        #[arg(short = 'n', long, default_value_t = 20)]
        limit: usize,
        revision: Option<String>,
    },
    Tree {
        #[arg(default_value = "HEAD")]
        revision: String,
        path: Option<String>,
    },
    Show {
        path: String,
        #[arg(long, default_value = "HEAD")]
        revision: String,
    },
    Diff {
        base: Option<String>,
        head: Option<String>,
        #[arg(long = "path")]
        paths: Vec<String>,
        #[arg(short = 'U', long, default_value_t = 3)]
        context: usize,
    },
    Runner {
        #[command(subcommand)]
        command: RunnerCommand,
    },
}

#[derive(Subcommand)]
enum RunnerCommand {
    Register {
        #[arg(long)]
        url: String,
        #[arg(long)]
        token: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long = "label")]
        labels: Vec<String>,
        #[arg(long, default_value_t = 0)]
        concurrency: usize,
        #[arg(long)]
        work_dir: Option<PathBuf>,
        #[arg(long)]
        config: Option<PathBuf>,
    },
    Run {
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long)]
        once: bool,
    },
    Service {
        #[command(subcommand)]
        command: ServiceCommand,
    },
}

#[derive(Subcommand)]
enum ServiceCommand {
    Install {
        #[arg(long)]
        config: Option<PathBuf>,
    },
    Uninstall,
    Status,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Runner { command } => runner(command).await,
        command => repository(command, &cli.repository, cli.json),
    }
}

fn repository(command: Command, path: &Path, json: bool) -> Result<()> {
    let repo =
        Repository::discover(path).with_context(|| format!("could not open {}", path.display()))?;
    match command {
        Command::Status => emit(json, &repo.status()?, |value| {
            println!(
                "On {}",
                value.branch.name.as_deref().unwrap_or("detached HEAD")
            );
            if value.branch.ahead > 0 || value.branch.behind > 0 {
                println!(
                    "Ahead {}, behind {}",
                    value.branch.ahead, value.branch.behind
                );
            }
            if value.changes.is_empty() {
                println!("Working tree clean");
            } else {
                for change in &value.changes {
                    println!("{:?}/{:?}\t{}", change.index, change.worktree, change.path);
                }
            }
        }),
        Command::Log { limit, revision } => {
            emit(json, &repo.commits(revision.as_deref(), limit)?, |values| {
                for value in values {
                    println!(
                        "{}  {}  {}  {}",
                        value.short_id, value.authored_at, value.author, value.title
                    );
                }
            })
        }
        Command::Tree { revision, path } => {
            emit(json, &repo.tree(&revision, path.as_deref())?, |values| {
                for value in values {
                    println!("{:?}\t{}\t{}", value.kind, value.object_id, value.path);
                }
            })
        }
        Command::Show { path, revision } => {
            let blob = repo.read_blob(&revision, &path)?;
            if json {
                println!("{}", serde_json::to_string_pretty(&blob)?);
            } else {
                print!("{}", String::from_utf8_lossy(&blob.bytes));
            }
        }
        Command::Diff {
            base,
            head,
            paths,
            context,
        } => {
            let diff = repo.diff(base.as_deref(), head.as_deref(), &paths, context)?;
            if json {
                println!("{}", serde_json::to_string_pretty(&diff)?);
            } else {
                print!("{}", diff.patch);
            }
        }
        Command::Runner { .. } => unreachable!(),
    }
    Ok(())
}

async fn runner(command: RunnerCommand) -> Result<()> {
    match command {
        RunnerCommand::Register {
            url,
            token,
            name,
            mut labels,
            concurrency,
            work_dir,
            config,
        } => {
            let name = name.unwrap_or_else(machine_name);
            if labels.is_empty() {
                labels = vec![
                    std::env::consts::OS.to_owned(),
                    std::env::consts::ARCH.to_owned(),
                ];
            }
            let concurrency = if concurrency == 0 {
                std::thread::available_parallelism()
                    .map(usize::from)
                    .unwrap_or(1)
            } else {
                concurrency
            };
            let config_path = config.unwrap_or(runner::config::default_config_path()?);
            let work_dir = work_dir.unwrap_or(runner::config::default_work_dir()?);
            let registered = runner::register(runner::RegisterOptions {
                url: &url,
                enrollment_token: &token,
                name: &name,
                labels: &labels,
                concurrency,
                work_dir: &work_dir,
                config_path: &config_path,
            })
            .await?;
            println!("Connected {} ({})", registered.name, registered.runner_id);
            println!("Config: {}", config_path.display());
            println!(
                "Start: marl runner run --config \"{}\"",
                config_path.display()
            );
            Ok(())
        }
        RunnerCommand::Run { config, once } => {
            let path = config.unwrap_or(runner::config::default_config_path()?);
            runner::executor::run(runner::config::load(&path)?, once).await
        }
        RunnerCommand::Service { command } => match command {
            ServiceCommand::Install { config } => {
                let path = config.unwrap_or(runner::config::default_config_path()?);
                runner::config::load(&path)?;
                runner::service::install(&path)
            }
            ServiceCommand::Uninstall => runner::service::uninstall(),
            ServiceCommand::Status => runner::service::status(),
        },
    }
}

fn machine_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "marl-runner".to_owned())
        .to_lowercase()
        .replace(
            |character: char| {
                !character.is_ascii_alphanumeric() && character != '-' && character != '_'
            },
            "-",
        )
}

fn emit<T: Serialize>(json: bool, value: &T, human: impl FnOnce(&T)) {
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(value).expect("serializable output")
        );
    } else {
        human(value);
    }
}
