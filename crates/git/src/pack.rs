use crate::pack_graph::{PackObject, inspect_pack, populate_object_references};
use crate::process::Command;
use crate::state::{AppState, is_object_id};
use anyhow::{Context, Result, bail};
use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::PathBuf, process::Stdio, sync::Arc};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
};
use tokio_util::io::{ReaderStream, StreamReader};

const MAX_PACK_BYTES: u64 = 256 * 1024 * 1024;
const MAX_EXPANDED_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_BLOB_BYTES: u64 = 100 * 1024 * 1024;
const MAX_OBJECTS: usize = 50_000;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PackReport {
    id: String,
    compressed_bytes: u64,
    expanded_bytes: u64,
    object_count: usize,
    largest_blob_bytes: u64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ProposedRefs {
    refs: std::collections::BTreeMap<String, String>,
}

pub(crate) async fn upload_known_index(
    State(state): State<Arc<AppState>>,
    Path((push, index)): Path<(String, String)>,
    request: Request,
) -> Response {
    pack_response(validate_known_index(state, push, index, request).await)
}

async fn validate_known_index(
    state: Arc<AppState>,
    push: String,
    index: String,
    request: Request,
) -> Result<Response> {
    authorize(&state, request.headers())?;
    validate_session_part(&push)?;
    if !is_object_id(&index) {
        bail!("invalid pack index identifier")
    }
    let directory = session_path(&state, &push)?;
    fs::create_dir_all(directory.join("known")).await?;
    let path = directory.join("known").join(format!("{index}.idx"));
    write_limited(request, &path, 64 * 1024 * 1024).await?;
    let output = Command::new("git")
        .arg("show-index")
        .stdin(fs::File::open(&path).await?.into_std().await)
        .output()
        .await
        .context("inspect known pack index")?;
    if !output.status.success() {
        bail!("known pack index is invalid")
    }
    Ok(StatusCode::NO_CONTENT.into_response())
}

pub(crate) async fn upload_pack(
    State(state): State<Arc<AppState>>,
    Path((push, pack)): Path<(String, String)>,
    request: Request,
) -> Response {
    pack_response(validate_pack(state, push, pack, request).await)
}

async fn validate_pack(
    state: Arc<AppState>,
    push: String,
    pack: String,
    request: Request,
) -> Result<Response> {
    authorize(&state, request.headers())?;
    validate_session_part(&push)?;
    validate_session_part(&pack)?;
    let directory = session_path(&state, &push)?.join(&pack);
    fs::create_dir_all(&directory).await?;
    let temporary_pack = directory.join("upload.pack");
    let compressed_bytes = write_limited(request, &temporary_pack, MAX_PACK_BYTES).await?;
    let temporary_index = directory.join("upload.idx");
    let output = Command::new("git")
        .args(["index-pack", "--strict", "--index-version=2", "-o"])
        .arg(&temporary_index)
        .arg(&temporary_pack)
        .output()
        .await
        .context("validate Git pack")?;
    if !output.status.success() {
        bail!(
            "git index-pack rejected the upload: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
    }
    let id = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if !is_object_id(&id) {
        bail!("git index-pack returned an invalid pack identifier")
    }
    let pack_path = directory.join(format!("pack-{id}.pack"));
    let index_path = directory.join(format!("pack-{id}.idx"));
    fs::rename(&temporary_pack, &pack_path).await?;
    fs::rename(&temporary_index, &index_path).await?;
    let (objects, expanded_bytes, largest_blob_bytes) = inspect_pack(&index_path).await?;
    if objects.len() > MAX_OBJECTS {
        bail!("pack contains more than {MAX_OBJECTS} objects")
    }
    if expanded_bytes > MAX_EXPANDED_BYTES {
        bail!("pack expands beyond the 1 GiB push limit")
    }
    if largest_blob_bytes > MAX_BLOB_BYTES {
        bail!("pack contains a blob larger than 100 MiB")
    }
    let report = PackReport {
        id,
        compressed_bytes,
        expanded_bytes,
        object_count: objects.len(),
        largest_blob_bytes,
    };
    fs::write(
        directory.join("objects.json"),
        serde_json::to_vec(&objects)?,
    )
    .await?;
    fs::write(directory.join("report.json"), serde_json::to_vec(&report)?).await?;
    Ok((StatusCode::CREATED, axum::Json(report)).into_response())
}

pub(crate) async fn validate_graph(
    State(state): State<Arc<AppState>>,
    Path((push, pack)): Path<(String, String)>,
    headers: HeaderMap,
    axum::Json(proposed): axum::Json<ProposedRefs>,
) -> Response {
    pack_response(graph_inner(state, push, pack, headers, proposed).await)
}

pub(crate) async fn validate_proposed_refs(
    State(state): State<Arc<AppState>>,
    Path(push): Path<String>,
    headers: HeaderMap,
    axum::Json(proposed): axum::Json<ProposedRefs>,
) -> Response {
    pack_response(proposed_refs_inner(state, push, headers, proposed).await)
}

async fn proposed_refs_inner(
    state: Arc<AppState>,
    push: String,
    headers: HeaderMap,
    proposed: ProposedRefs,
) -> Result<Response> {
    authorize(&state, &headers)?;
    validate_session_part(&push)?;
    let known = known_objects(session_path(&state, &push)?.join("known")).await?;
    validate_ref_targets(&proposed, &known)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn graph_inner(
    state: Arc<AppState>,
    push: String,
    pack: String,
    headers: HeaderMap,
    proposed: ProposedRefs,
) -> Result<Response> {
    authorize(&state, &headers)?;
    let directory = session_path(&state, &push)?.join(&pack);
    let report: PackReport =
        serde_json::from_slice(&fs::read(directory.join("report.json")).await?)?;
    let mut objects: Vec<PackObject> =
        serde_json::from_slice(&fs::read(directory.join("objects.json")).await?)?;
    let mut known = known_objects(session_path(&state, &push)?.join("known")).await?;
    known.extend(objects.iter().map(|object| object.id.clone()));
    validate_ref_targets(&proposed, &known)?;
    validate_object_graph(&directory, &report.id, &mut objects, &known).await?;
    fs::write(
        directory.join("objects.json"),
        serde_json::to_vec(&objects)?,
    )
    .await?;
    Ok(axum::Json(report).into_response())
}

fn validate_ref_targets(proposed: &ProposedRefs, known: &HashSet<String>) -> Result<()> {
    for target in proposed.refs.values() {
        if !is_object_id(target) || !known.contains(target) {
            bail!("proposed ref target {target} is not present in validated storage")
        }
    }
    Ok(())
}

pub(crate) async fn read_pack_file(
    State(state): State<Arc<AppState>>,
    Path((push, pack, kind)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Response {
    pack_response(read_pack_file_inner(state, push, pack, kind, headers).await)
}

async fn read_pack_file_inner(
    state: Arc<AppState>,
    push: String,
    pack: String,
    kind: String,
    headers: HeaderMap,
) -> Result<Response> {
    authorize(&state, &headers)?;
    let directory = session_path(&state, &push)?.join(pack);
    let report: PackReport =
        serde_json::from_slice(&fs::read(directory.join("report.json")).await?)?;
    let (path, content_type) = match kind.as_str() {
        "pack" => (
            directory.join(format!("pack-{}.pack", report.id)),
            "application/x-git-packed-objects",
        ),
        "index" => (
            directory.join(format!("pack-{}.idx", report.id)),
            "application/x-git-packed-objects-toc",
        ),
        "objects" => (directory.join("objects.json"), "application/json"),
        _ => bail!("unknown pack file"),
    };
    let file = fs::File::open(&path).await?;
    let size = file.metadata().await?.len();
    Ok(Response::builder()
        .header("content-type", content_type)
        .header("content-length", size)
        .body(Body::from_stream(ReaderStream::new(file)))?)
}

pub(crate) async fn remove_session(
    State(state): State<Arc<AppState>>,
    Path(push): Path<String>,
    headers: HeaderMap,
) -> Response {
    if authorize(&state, &headers).is_err() || validate_session_part(&push).is_err() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let path = match session_path(&state, &push) {
        Ok(path) => path,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let _ = fs::remove_dir_all(path).await;
    StatusCode::NO_CONTENT.into_response()
}

async fn known_objects(directory: PathBuf) -> Result<HashSet<String>> {
    let mut known = HashSet::new();
    if !fs::try_exists(&directory).await? {
        return Ok(known);
    }
    let mut entries = fs::read_dir(directory).await?;
    while let Some(entry) = entries.next_entry().await? {
        let mut child = Command::new("git")
            .arg("show-index")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()?;
        let mut stdin = child.stdin.take().context("open git show-index stdin")?;
        let bytes = fs::read(entry.path()).await?;
        tokio::spawn(async move {
            let _ = stdin.write_all(&bytes).await;
        });
        let output = child.wait_with_output().await?;
        if !output.status.success() {
            bail!("known pack index became invalid")
        }
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            if let Some(id) = line.split_whitespace().nth(1).filter(|id| is_object_id(id)) {
                known.insert(id.to_owned());
            }
        }
    }
    Ok(known)
}

async fn validate_object_graph(
    directory: &std::path::Path,
    pack_id: &str,
    objects: &mut [PackObject],
    known: &HashSet<String>,
) -> Result<()> {
    let repository = directory.join("repository.git");
    fs::create_dir_all(repository.join("objects/pack")).await?;
    fs::write(repository.join("HEAD"), b"ref: refs/heads/main\n").await?;
    fs::copy(
        directory.join(format!("pack-{pack_id}.pack")),
        repository.join(format!("objects/pack/pack-{pack_id}.pack")),
    )
    .await?;
    fs::copy(
        directory.join(format!("pack-{pack_id}.idx")),
        repository.join(format!("objects/pack/pack-{pack_id}.idx")),
    )
    .await?;
    populate_object_references(&repository, objects).await?;
    let structural = objects.iter().filter(|object| object.kind != "blob");
    for object in structural {
        for reference in &object.references {
            if !known.contains(reference) {
                bail!(
                    "{} {} references missing object {}",
                    object.kind,
                    object.id,
                    reference
                )
            }
        }
    }
    Ok(())
}

async fn write_limited(request: Request, path: &std::path::Path, limit: u64) -> Result<u64> {
    let stream = request
        .into_body()
        .into_data_stream()
        .map_err(std::io::Error::other);
    let mut reader = StreamReader::new(stream).take(limit + 1);
    let mut file = fs::File::create(path).await?;
    let bytes = tokio::io::copy(&mut reader, &mut file).await?;
    file.flush().await?;
    if bytes > limit {
        let _ = fs::remove_file(path).await;
        bail!("upload exceeds its byte limit")
    }
    Ok(bytes)
}

fn authorize(state: &AppState, headers: &HeaderMap) -> Result<()> {
    if headers
        .get("x-marl-storage-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        bail!("storage route not found")
    }
    Ok(())
}

fn validate_session_part(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 96
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        bail!("invalid storage session")
    }
    Ok(())
}

fn session_path(state: &AppState, push: &str) -> Result<PathBuf> {
    validate_session_part(push)?;
    Ok(state.repositories.join(".marl-packs").join(push))
}

fn pack_response(result: Result<Response>) -> Response {
    match result {
        Ok(response) => response,
        Err(error) => {
            eprintln!("pack operation failed: {error:#}");
            (StatusCode::UNPROCESSABLE_ENTITY, error.to_string()).into_response()
        }
    }
}
