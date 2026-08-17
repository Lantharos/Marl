mod blob;
mod compare;
mod merge;
mod merge_operations;
mod metadata;
mod pack;
mod pack_graph;
mod refs;
mod relocate;
mod repository_files;
mod repository_storage;
mod smart_http;
mod state;

use anyhow::{Context, Result};
use axum::{Router, routing::any};
use state::AppState;
use std::{path::PathBuf, sync::Arc};
use tokio::fs;

#[tokio::main]
async fn main() -> Result<()> {
    let local_storage = std::env::var("STY_GIT_LOCAL").map_or(true, |value| value != "0");
    let repositories = std::env::var("STY_GIT_ROOT").map_or_else(
        |_| {
            let mut workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            workspace.pop();
            workspace.pop();
            workspace.join(".sty-data/repositories")
        },
        PathBuf::from,
    );
    fs::create_dir_all(&repositories)
        .await
        .context("create repository root")?;
    let state = Arc::new(AppState {
        repositories,
        control_plane: std::env::var("STY_API_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:42618".into()),
        client: reqwest::Client::new(),
        gateway_token: std::env::var("STY_GIT_GATEWAY_TOKEN")
            .unwrap_or_else(|_| "sty-local".into()),
        local_storage,
    });
    let repository_root = state.repositories.display().to_string();
    if state.local_storage {
        tokio::spawn(metadata::backfill_pending_repositories(state.clone()));
    }
    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok\n" }))
        .route(
            "/_sty/repositories/{owner}/{repository}/status",
            axum::routing::get(repository_storage::repository_status),
        )
        .route(
            "/_sty/repositories/{owner}/{repository}/packs/{pack}/{kind}",
            axum::routing::put(repository_storage::upload_repository_pack),
        )
        .route(
            "/_sty/repositories/{owner}/{repository}/activate",
            axum::routing::post(repository_storage::activate_repository),
        )
        .route(
            "/_sty/repositories/{owner}/{repository}/captures/{push}",
            axum::routing::post(repository_storage::capture_repository)
                .delete(repository_storage::delete_capture),
        )
        .route(
            "/_sty/repositories/{owner}/{repository}/captures/{push}/{kind}",
            axum::routing::get(repository_storage::read_capture),
        )
        .route(
            "/_sty/packs/{push}/known/{index}",
            axum::routing::put(pack::upload_known_index),
        )
        .route(
            "/_sty/packs/{push}/{pack}",
            axum::routing::put(pack::upload_pack),
        )
        .route(
            "/_sty/packs/{push}/{pack}/graph",
            axum::routing::post(pack::validate_graph),
        )
        .route(
            "/_sty/packs/{push}/refs",
            axum::routing::post(pack::validate_proposed_refs),
        )
        .route(
            "/_sty/packs/{push}/{pack}/{kind}",
            axum::routing::get(pack::read_pack_file),
        )
        .route(
            "/_sty/packs/{push}",
            axum::routing::delete(pack::remove_session),
        )
        .route("/_sty/merge", axum::routing::post(merge::merge_request))
        .route("/_sty/pulls/pin", axum::routing::post(refs::pin_pull))
        .route(
            "/_sty/repositories/relocate",
            axum::routing::post(relocate::relocate_repository),
        )
        .route("/_sty/blob", axum::routing::post(blob::read_blob))
        .route("/_sty/tree", axum::routing::post(metadata::read_tree))
        .route(
            "/_sty/index",
            axum::routing::post(metadata::index_repository),
        )
        .route(
            "/_sty/compare",
            axum::routing::post(compare::compare_request),
        )
        .route("/_sty/patch", axum::routing::post(compare::patch_request))
        .route("/_sty/commit", axum::routing::post(compare::commit_request))
        .route("/{*path}", any(smart_http::git_request))
        .with_state(state);
    let address = std::env::var("STY_GIT_LISTEN").unwrap_or_else(|_| "127.0.0.1:42619".into());
    let listener = tokio::net::TcpListener::bind(&address)
        .await
        .with_context(|| format!("bind {address}"))?;
    println!(
        "Sty Git gateway listening on http://{address} with repositories at {}",
        repository_root
    );
    axum::serve(listener, app)
        .await
        .context("serve Git gateway")?;
    Ok(())
}
