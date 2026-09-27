mod browse;
mod merge;
mod pack;
mod process;
mod signing;
mod state;
mod storage;
mod transport;

use anyhow::{Context, Result};
use axum::{Router, routing::any};
use state::AppState;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::fs;

#[tokio::main]
async fn main() -> Result<()> {
    let local_storage = std::env::var("MARL_GIT_LOCAL").map_or(true, |value| value != "0");
    let repositories =
        PathBuf::from(std::env::var("MARL_GIT_ROOT").expect("MARL_GIT_ROOT is required"));
    fs::create_dir_all(&repositories)
        .await
        .context("create repository root")?;
    let state = Arc::new(AppState {
        repositories,
        control_plane: std::env::var("MARL_API_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:42618".into()),
        client: reqwest::Client::new(),
        gateway_token: std::env::var("MARL_GIT_GATEWAY_TOKEN")
            .expect("MARL_GIT_GATEWAY_TOKEN is required"),
        local_storage,
        git_edge: std::env::var("MARL_GIT_EDGE_URL")
            .ok()
            .map(|value| value.trim_end_matches('/').to_owned()),
        repository_locks: Mutex::new(HashMap::new()),
    });
    let repository_root = state.repositories.display().to_string();
    if std::env::args().nth(1).as_deref() == Some("--signing-hook") {
        return signing::hook::run(&state).await;
    }
    if state.local_storage {
        tokio::spawn(browse::metadata::backfill_pending_repositories(
            state.clone(),
        ));
    }
    let ssh_address = std::env::var("MARL_SSH_LISTEN")
        .ok()
        .or_else(|| state.local_storage.then(|| "127.0.0.1:42621".into()));
    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok\n" }))
        .route(
            "/_marl/repositories/{owner}/{repository}/status",
            axum::routing::get(storage::repository::repository_status),
        )
        .route(
            "/_marl/repositories/{owner}/{repository}/packs/{pack}/{kind}",
            axum::routing::put(storage::repository::upload_repository_pack),
        )
        .route(
            "/_marl/repositories/{owner}/{repository}/activate",
            axum::routing::post(storage::repository::activate_repository),
        )
        .route(
            "/_marl/repositories/{owner}/{repository}/captures/{push}",
            axum::routing::post(storage::repository::capture_repository)
                .delete(storage::repository::delete_capture),
        )
        .route(
            "/_marl/repositories/{owner}/{repository}/captures/{push}/{kind}",
            axum::routing::get(storage::repository::read_capture),
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
            "/_marl/packs/{push}/{pack}/signatures/scan",
            axum::routing::post(pack::signatures::scan),
        )
        .route(
            "/_marl/packs/{push}/{pack}/signatures/check",
            axum::routing::post(pack::signatures::check),
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
        .route(
            "/_marl/mergeability",
            axum::routing::post(merge::mergeability::mergeability),
        )
        .route(
            "/_marl/pulls/pin",
            axum::routing::post(browse::refs::pin_pull),
        )
        .route(
            "/_marl/tags/list",
            axum::routing::post(browse::refs::list_tags),
        )
        .route(
            "/_marl/tags/create",
            axum::routing::post(browse::refs::create_tag),
        )
        .route(
            "/_marl/branches/delete",
            axum::routing::post(browse::branches::delete_branch),
        )
        .route(
            "/_marl/repositories/purge",
            axum::routing::post(storage::delete::delete_repository),
        )
        .route(
            "/_marl/repositories/relocate",
            axum::routing::post(storage::relocate::relocate_repository),
        )
        .route(
            "/_marl/repositories/fork",
            axum::routing::post(storage::fork::fork_repository),
        )
        .route("/_marl/blob", axum::routing::post(browse::blob::read_blob))
        .route(
            "/_marl/archive",
            axum::routing::post(browse::archive::repository_archive),
        )
        .route(
            "/_marl/tree",
            axum::routing::post(browse::metadata::read_tree),
        )
        .route(
            "/_marl/index",
            axum::routing::post(browse::metadata::index_repository),
        )
        .route(
            "/_marl/compare",
            axum::routing::post(browse::compare::compare_request),
        )
        .route(
            "/_marl/patch",
            axum::routing::post(browse::compare::patch_request),
        )
        .route(
            "/_marl/commit",
            axum::routing::post(browse::compare::commit_request),
        )
        .route("/{*path}", any(transport::smart_http::git_request))
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
    if let Some(ssh_address) = ssh_address {
        tokio::try_join!(http, transport::ssh::serve(state, ssh_address))?;
    } else {
        http.await?;
    }
    Ok(())
}
