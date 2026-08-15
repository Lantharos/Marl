mod compare;
mod index;
mod merge;
mod smart_http;
mod snapshot;
mod state;

use anyhow::{Context, Result};
use axum::{Router, routing::any};
use state::AppState;
use std::{path::PathBuf, sync::Arc};
use tokio::fs;

#[tokio::main]
async fn main() -> Result<()> {
    let repositories = PathBuf::from(
        std::env::var("STY_GIT_ROOT").unwrap_or_else(|_| ".sty-data/repositories".into()),
    );
    fs::create_dir_all(&repositories)
        .await
        .context("create repository root")?;
    let state = Arc::new(AppState {
        repositories,
        control_plane: std::env::var("STY_API_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8787".into()),
        client: reqwest::Client::new(),
        gateway_token: std::env::var("STY_GIT_GATEWAY_TOKEN")
            .unwrap_or_else(|_| "sty-local".into()),
    });
    let app = Router::new()
        .route(
            "/_sty/snapshot/status/{owner}/{repository}",
            axum::routing::get(snapshot::status),
        )
        .route(
            "/_sty/snapshot/restore/{owner}/{repository}",
            axum::routing::put(snapshot::restore),
        )
        .route(
            "/_sty/snapshot/export/{owner}/{repository}",
            axum::routing::get(snapshot::export),
        )
        .route("/_sty/merge", axum::routing::post(merge::merge_request))
        .route(
            "/_sty/compare",
            axum::routing::post(compare::compare_request),
        )
        .route("/_sty/commit", axum::routing::post(compare::commit_request))
        .route("/{*path}", any(smart_http::git_request))
        .with_state(state);
    let address = std::env::var("STY_GIT_LISTEN").unwrap_or_else(|_| "127.0.0.1:8788".into());
    let listener = tokio::net::TcpListener::bind(&address)
        .await
        .with_context(|| format!("bind {address}"))?;
    println!("Sty Git gateway listening on http://{address}");
    axum::serve(listener, app)
        .await
        .context("serve Git gateway")?;
    Ok(())
}
