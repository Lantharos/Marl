use crate::{
    repository_storage::{
        Activation, activate_repository_state, capture_path, capture_repository_state, pack_cache,
    },
    state::AppState,
};
use anyhow::{Context, Result, bail};
use futures_util::TryStreamExt;
use reqwest::{Body, Response, header::CONTENT_LENGTH};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, io, path::Path, sync::Arc};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncSeekExt},
};
use tokio_util::io::{ReaderStream, StreamReader};

const MAX_PACK_BYTES: u64 = 256 * 1024 * 1024;
const MAX_INDEX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StorageSnapshot {
    pub(crate) generation: u64,
    pub(crate) refs: BTreeMap<String, String>,
    packs: Vec<StoragePack>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoragePack {
    id: String,
    compressed_bytes: u64,
    pack_url: String,
    index_url: String,
}

#[derive(Deserialize)]
struct SnapshotResponse {
    repository: StorageSnapshot,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatePush<'a> {
    expected_refs: &'a BTreeMap<String, String>,
    refs: &'a BTreeMap<String, String>,
    packs: Vec<PackSize>,
}

#[derive(Serialize)]
struct PackSize {
    bytes: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatePushResponse {
    push: PushPlan,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushPlan {
    id: String,
    part_bytes: u64,
    packs: Vec<PlannedPack>,
}

#[derive(Deserialize)]
struct PlannedPack {
    number: u64,
    bytes: u64,
    parts: u64,
}

pub(crate) async fn hydrate(
    state: &AppState,
    owner: &str,
    repository: &str,
    actor_id: Option<&str>,
) -> Result<StorageSnapshot> {
    let edge = edge_url(state)?;
    let response = state
        .client
        .get(format!(
            "{edge}/v1/repositories/{owner}/{repository}/storage"
        ))
        .headers(gateway_headers(state, actor_id)?)
        .send()
        .await
        .context("request canonical repository snapshot")?;
    let response = require_success(response, "read canonical repository snapshot").await?;
    let snapshot = response
        .json::<SnapshotResponse>()
        .await
        .context("decode canonical repository snapshot")?
        .repository;
    let repository_path = crate::state::repository_path(&state.repositories, owner, repository)?;
    let current = fs::read_to_string(repository_path.join("marl-generation"))
        .await
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok());
    if current == Some(snapshot.generation) {
        return Ok(snapshot);
    }

    let cache = pack_cache(state, owner, repository)?;
    fs::create_dir_all(&cache).await?;
    for pack in &snapshot.packs {
        download_if_missing(
            state,
            edge,
            actor_id,
            &pack.pack_url,
            &cache.join(format!("pack-{}.pack", pack.id)),
            MAX_PACK_BYTES,
            Some(pack.compressed_bytes),
        )
        .await?;
        download_if_missing(
            state,
            edge,
            actor_id,
            &pack.index_url,
            &cache.join(format!("pack-{}.idx", pack.id)),
            MAX_INDEX_BYTES,
            None,
        )
        .await?;
    }
    activate_repository_state(
        state,
        owner,
        repository,
        Activation {
            generation: snapshot.generation,
            refs: snapshot.refs.clone(),
            packs: snapshot.packs.iter().map(|pack| pack.id.clone()).collect(),
        },
    )
    .await?;
    Ok(snapshot)
}

pub(crate) async fn publish(
    state: Arc<AppState>,
    owner: String,
    repository: String,
    actor_id: Option<String>,
    snapshot: StorageSnapshot,
) -> Result<()> {
    let capture_id = format!("push_{:032x}", rand::random::<u128>());
    let result = publish_inner(
        state.clone(),
        &owner,
        &repository,
        actor_id.as_deref(),
        &capture_id,
        snapshot,
    )
    .await;
    let _ = fs::remove_dir_all(capture_path(&state, &capture_id)?).await;
    result
}

async fn publish_inner(
    state: Arc<AppState>,
    owner: &str,
    repository: &str,
    actor_id: Option<&str>,
    capture_id: &str,
    snapshot: StorageSnapshot,
) -> Result<()> {
    let capture = capture_repository_state(
        state.clone(),
        owner.to_owned(),
        repository.to_owned(),
        capture_id.to_owned(),
        snapshot.refs.clone(),
    )
    .await?;
    if capture.refs == snapshot.refs {
        return Ok(());
    }
    let edge = edge_url(&state)?;
    let create = state
        .client
        .post(format!(
            "{edge}/v1/repositories/{owner}/{repository}/pushes"
        ))
        .headers(gateway_headers(&state, actor_id)?)
        .json(&CreatePush {
            expected_refs: &snapshot.refs,
            refs: &capture.refs,
            packs: capture
                .has_pack
                .then_some(PackSize {
                    bytes: capture.pack_bytes,
                })
                .into_iter()
                .collect(),
        })
        .send()
        .await
        .context("begin canonical SSH push")?;
    let plan = require_success(create, "begin canonical SSH push")
        .await?
        .json::<CreatePushResponse>()
        .await
        .context("decode canonical SSH push plan")?
        .push;
    if capture.has_pack {
        let pack = plan
            .packs
            .first()
            .context("canonical SSH push omitted its pack plan")?;
        if pack.number != 0
            || pack.bytes != capture.pack_bytes
            || pack.parts != capture.pack_bytes.div_ceil(plan.part_bytes)
        {
            bail!("canonical SSH push returned an invalid pack plan")
        }
        upload_pack_parts(
            &state,
            edge,
            owner,
            repository,
            actor_id,
            &plan,
            &capture_path(&state, capture_id)?.join("capture.pack"),
        )
        .await?;
    } else if !plan.packs.is_empty() {
        bail!("canonical SSH push unexpectedly requested pack data")
    }
    let complete = state
        .client
        .post(format!(
            "{edge}/v1/repositories/{owner}/{repository}/pushes/{}/complete",
            plan.id
        ))
        .headers(gateway_headers(&state, actor_id)?)
        .send()
        .await
        .context("publish canonical SSH push")?;
    require_success(complete, "publish canonical SSH push").await?;
    Ok(())
}

async fn upload_pack_parts(
    state: &AppState,
    edge: &str,
    owner: &str,
    repository: &str,
    actor_id: Option<&str>,
    plan: &PushPlan,
    path: &Path,
) -> Result<()> {
    let pack = plan.packs.first().context("missing pack plan")?;
    for part in 1..=pack.parts {
        let offset = (part - 1) * plan.part_bytes;
        let bytes = (pack.bytes - offset).min(plan.part_bytes);
        let mut file = fs::File::open(path).await?;
        file.seek(std::io::SeekFrom::Start(offset)).await?;
        let stream = ReaderStream::new(file.take(bytes));
        let response = state
            .client
            .put(format!(
                "{edge}/v1/repositories/{owner}/{repository}/pushes/{}/packs/{}/parts/{part}",
                plan.id, pack.number
            ))
            .headers(gateway_headers(state, actor_id)?)
            .header(CONTENT_LENGTH, bytes)
            .body(Body::wrap_stream(stream))
            .send()
            .await
            .with_context(|| format!("upload canonical SSH pack part {part}"))?;
        require_success(response, "upload canonical SSH pack part").await?;
    }
    Ok(())
}

async fn download_if_missing(
    state: &AppState,
    edge: &str,
    actor_id: Option<&str>,
    path: &str,
    destination: &Path,
    limit: u64,
    expected: Option<u64>,
) -> Result<()> {
    if let Ok(metadata) = fs::metadata(destination).await {
        if expected.is_none_or(|bytes| metadata.len() == bytes) {
            return Ok(());
        }
        fs::remove_file(destination).await?;
    }
    let response = state
        .client
        .get(format!("{edge}{path}"))
        .headers(gateway_headers(state, actor_id)?)
        .send()
        .await
        .context("download canonical repository pack")?;
    let response = require_success(response, "download canonical repository pack").await?;
    if let Some(length) = response.content_length()
        && (length > limit || expected.is_some_and(|bytes| bytes != length))
    {
        bail!("canonical repository pack has an invalid size")
    }
    let temporary = destination.with_extension(format!("tmp-{:016x}", rand::random::<u64>()));
    let stream = response.bytes_stream().map_err(io::Error::other);
    let mut reader = StreamReader::new(stream).take(limit + 1);
    let mut file = fs::File::create(&temporary).await?;
    let copied = tokio::io::copy(&mut reader, &mut file).await?;
    file.sync_all().await?;
    drop(file);
    if copied > limit || expected.is_some_and(|bytes| bytes != copied) {
        let _ = fs::remove_file(&temporary).await;
        bail!("canonical repository pack exceeded its size limit")
    }
    fs::rename(&temporary, destination).await?;
    Ok(())
}

fn edge_url(state: &AppState) -> Result<&str> {
    state
        .git_edge
        .as_deref()
        .context("MARL_GIT_EDGE_URL is required when production SSH is enabled")
}

fn gateway_headers(state: &AppState, actor_id: Option<&str>) -> Result<reqwest::header::HeaderMap> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "x-marl-gateway-token",
        state
            .gateway_token
            .parse()
            .context("invalid Git gateway token")?,
    );
    if let Some(actor_id) = actor_id {
        headers.insert(
            "x-marl-actor-id",
            actor_id.parse().context("invalid SSH actor identifier")?,
        );
    }
    Ok(headers)
}

async fn require_success(response: Response, operation: &str) -> Result<Response> {
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status();
    let detail = response.text().await.unwrap_or_default();
    bail!("{operation} failed with {status}: {}", detail.trim())
}
