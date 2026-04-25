use std::net::SocketAddr;
use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;

use sty_local_server::store::{ObjectStore, Store};

#[derive(Parser)]
#[command(name = "sty-local-server")]
#[command(about = "Local PIG-compatible sty remote server")]
struct Cli {
    #[arg(long, default_value = "127.0.0.1:7379")]
    bind: SocketAddr,
    #[arg(long, default_value = ".sty-data")]
    data: PathBuf,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let store = Store::new(cli.data.clone())?;
    let objects = ObjectStore::new(cli.data.clone());
    println!("sty local server listening on http://{}", cli.bind);
    println!("data: {}", cli.data.display());
    sty_local_server::server::run(cli.bind, store, objects).await
}
