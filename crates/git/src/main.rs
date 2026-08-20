mod blob;
mod compare;
mod merge;
mod merge_operations;
mod metadata;
mod pack;
mod pack_graph;
mod process;
mod refs;
mod relocate;
mod repository_files;
mod repository_storage;
mod smart_http;
mod ssh;
mod state;

use anyhow::{Context, Result};
use axum::{Router, routing::any};
use state::AppState;
use std::{path::PathBuf, sync::Arc};
use tokio::fs;

#[tokio::main]
async fn main() -> Result<()> {
    let local_storage = std::env::var("MARL_GIT_LOCAL").map_or(true, |value| value != "0");
    let repositories = std::env::var("MARL_GIT_ROOT").map_or_else(
        |_| {
            let mut workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            workspace.pop();
            workspace.pop();
            workspace.join(".marl-data/repositories")
        },
        PathBuf::from,
    );
    fs::create_dir_all(&repositories)
        .await
        .context("create repository root")?;
    let state = Arc::new(AppState {
        repositories,
        control_plane: std::env::var("MARL_API_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:42618".into()),
        client: reqwest::Client::new(),
        gateway_token: std::env::var("MARL_GIT_GATEWAY_TOKEN")
            .unwrap_or_else(|_| "marl-local".into()),
        local_storage,
    });
    let repository_root = state.repositories.display().to_string();
    if state.local_storage {
        tokio::spawn(metadata::backfill_pending_repositories(state.clone()));
    }
    let ssh_address = std::env::var("MARL_SSH_LISTEN").unwrap_or_else(|_| "127.0.0.1:42621".into());
    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok\n" }))
        .route(
            "/_marl/repositories/{owner}/{repository}/status",
            axum::routing::get(repository_storage::repository_status),
        )
        .route(
            "/_marl/repositories/{owner}/{repository}/packs/{pack}/{kind}",
            axum::routing::put(repository_storage::upload_repository_pack),
        )
        .route(
            "/_marl/repositories/{owner}/{repository}/activate",
            axum::routing::post(repository_storage::activate_repository),
        )
        .route(
            "/_marl/repositories/{owner}/{repository}/captures/{push}",
            axum::routing::post(repository_storage::capture_repository)
                .delete(repository_storage::delete_capture),
        )
        .route(
            "/_marl/repositories/{owner}/{repository}/captures/{push}/{kind}",
            axum::routing::get(repository_storage::read_capture),
        )
        .route(
            "/_marl/packs/{push}/known/{index}",
            axum::routing::put(pack::upload_known_index),
        )
        .route(
            "/_marl/packs/{push}/{pack}",
            axum::routing::put(pack::upload_pack),
        )
        .route(
            "/_marl/packs/{push}/{pack}/graph",
            axum::routing::post(pack::validate_graph),
        )
        .route(
            "/_marl/packs/{push}/refs",
            axum::routing::post(pack::validate_proposed_refs),
        )
        .route(
            "/_marl/packs/{push}/{pack}/{kind}",
            axum::routing::get(pack::read_pack_file),
        )
        .route(
            "/_marl/packs/{push}",
            axum::routing::delete(pack::remove_session),
        )
        .route("/_marl/merge", axum::routing::post(merge::merge_request))
        .route("/_marl/pulls/pin", axum::routing::post(refs::pin_pull))
        .route(
            "/_marl/repositories/relocate",
            axum::routing::post(relocate::relocate_repository),
        )
        .route("/_marl/blob", axum::routing::post(blob::read_blob))
        .route("/_marl/tree", axum::routing::post(metadata::read_tree))
        .route(
            "/_marl/index",
            axum::routing::post(metadata::index_repository),
        )
        .route(
            "/_marl/compare",
            axum::routing::post(compare::compare_request),
        )
        .route("/_marl/patch", axum::routing::post(compare::patch_request))
        .route(
            "/_marl/commit",
            axum::routing::post(compare::commit_request),
        )
        .route("/{*path}", any(smart_http::git_request))
        .with_state(state.clone());
    let address = std::env::var("MARL_GIT_LISTEN").unwrap_or_else(|_| "127.0.0.1:42619".into());
    let listener = tokio::net::TcpListener::bind(&address)
        .await
        .with_context(|| format!("bind {address}"))?;
    println!(
        "Marl Git gateway listening on http://{address} with repositories at {}",
        repository_root
    );
    let http = async {
        axum::serve(listener, app)
            .await
            .context("serve Git gateway")
    };
    tokio::try_join!(http, ssh::serve(state, ssh_address))?;
    Ok(())
}
