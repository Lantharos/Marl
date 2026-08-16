use crate::{
    pack::{inspect_pack, populate_object_references},
    state::{AppState, is_object_id, repository_path, safe_ref, safe_segment},
};
use anyhow::{Context, Result, bail};
use axum::{
    extract::{Path, Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf, sync::Arc};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};
use tokio_util::io::StreamReader;

const MAX_PACK_BYTES: u64 = 256 * 1024 * 1024;
const MAX_COMPACTED_PACK_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_INDEX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryStatus {
    generation: Option<u64>,
    cached_packs: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Capture {
    refs: BTreeMap<String, String>,
    pack_bytes: u64,
    has_pack: bool,
    pack_id: Option<String>,
    expanded_bytes: u64,
    object_count: usize,
    largest_blob_bytes: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CaptureRequest {
    known_refs: BTreeMap<String, String>,
    #[serde(default)]
    full: bool,
}

#[derive(Deserialize)]
pub(crate) struct Activation {
    generation: u64,
    refs: BTreeMap<String, String>,
    packs: Vec<String>,
}

pub(crate) async fn repository_status(
    State(state): State<Arc<AppState>>,
    Path((owner, repository)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    storage_response(status_inner(state, owner, repository, headers).await)
}

async fn status_inner(
    state: Arc<AppState>,
    owner: String,
    repository: String,
    headers: HeaderMap,
) -> Result<Response> {
    authorize(&state, &headers)?;
    validate_repository(&owner, &repository)?;
    let repository_path = repository_path(&state.repositories, &owner, &repository)?;
    let generation = match fs::read_to_string(repository_path.join("sty-generation")).await {
        Ok(value) => Some(value.trim().parse()?),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.into()),
    };
    let cache = pack_cache(&state, &owner, &repository)?;
    let mut cached_packs = Vec::new();
    if fs::try_exists(&cache).await? {
        let mut entries = fs::read_dir(cache).await?;
        while let Some(entry) = entries.next_entry().await? {
            let name = entry.file_name().to_string_lossy().into_owned();
            if let Some(id) = name
                .strip_prefix("pack-")
                .and_then(|value| value.strip_suffix(".pack"))
                && is_object_id(id)
                && fs::try_exists(entry.path().with_extension("idx")).await?
            {
                cached_packs.push(id.to_owned());
            }
        }
    }
    cached_packs.sort();
    Ok(axum::Json(RepositoryStatus {
        generation,
        cached_packs,
    })
    .into_response())
}

pub(crate) async fn upload_repository_pack(
    State(state): State<Arc<AppState>>,
    Path((owner, repository, pack, kind)): Path<(String, String, String, String)>,
    request: Request,
) -> Response {
    storage_response(upload_inner(state, owner, repository, pack, kind, request).await)
}

async fn upload_inner(
    state: Arc<AppState>,
    owner: String,
    repository: String,
    pack: String,
    kind: String,
    request: Request,
) -> Result<Response> {
    authorize(&state, request.headers())?;
    validate_repository(&owner, &repository)?;
    if !is_object_id(&pack) || !matches!(kind.as_str(), "pack" | "idx") {
        bail!("invalid repository pack")
    }
    let cache = pack_cache(&state, &owner, &repository)?;
    fs::create_dir_all(&cache).await?;
    let path = cache.join(format!("pack-{pack}.{kind}"));
    let limit = if kind == "pack" {
        MAX_PACK_BYTES
    } else {
        MAX_INDEX_BYTES
    };
    write_limited(request, &path, limit).await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

pub(crate) async fn activate_repository(
    State(state): State<Arc<AppState>>,
    Path((owner, repository)): Path<(String, String)>,
    headers: HeaderMap,
    axum::Json(activation): axum::Json<Activation>,
) -> Response {
    storage_response(activate_inner(state, owner, repository, headers, activation).await)
}

pub(crate) async fn capture_repository(
    State(state): State<Arc<AppState>>,
    Path((owner, repository, push)): Path<(String, String, String)>,
    headers: HeaderMap,
    axum::Json(request): axum::Json<CaptureRequest>,
) -> Response {
    storage_response(capture_inner(state, owner, repository, push, headers, request).await)
}

async fn capture_inner(
    state: Arc<AppState>,
    owner: String,
    repository: String,
    push: String,
    headers: HeaderMap,
    request: CaptureRequest,
) -> Result<Response> {
    authorize(&state, &headers)?;
    validate_repository(&owner, &repository)?;
    validate_push(&push)?;
    for (name, object_id) in &request.known_refs {
        if !safe_ref(name) || !name.starts_with("refs/") || !is_object_id(object_id) {
            bail!("capture contains an invalid known ref")
        }
    }
    let repository_path = repository_path(&state.repositories, &owner, &repository)?;
    let refs = read_refs(&repository_path).await?;
    let directory = capture_path(&state, &push)?;
    fs::create_dir_all(&directory).await?;
    let pack_path = directory.join("capture.pack");
    let pack_file = std::fs::File::create(&pack_path)?;
    let mut child = Command::new("git")
        .args(["-C"])
        .arg(&repository_path)
        .args(["pack-objects", "--revs", "--stdout", "--delta-base-offset"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::from(pack_file))
        .stderr(std::process::Stdio::piped())
        .spawn()?;
    let mut revisions = String::new();
    for object_id in refs.values() {
        revisions.push_str(object_id);
        revisions.push('\n');
    }
    if !refs.is_empty() {
        for object_id in request.known_refs.values() {
            revisions.push('^');
            revisions.push_str(object_id);
            revisions.push('\n');
        }
    }
    child
        .stdin
        .take()
        .context("open pack-objects stdin")?
        .write_all(revisions.as_bytes())
        .await?;
    let output = child.wait_with_output().await?;
    if !output.status.success() {
        bail!(
            "capture pack failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
    }
    let metadata = fs::metadata(&pack_path).await?;
    let maximum = if request.full {
        MAX_COMPACTED_PACK_BYTES
    } else {
        MAX_PACK_BYTES
    };
    if metadata.len() > maximum {
        bail!("compatibility push exceeds the compressed pack limit")
    }
    let mut header = [0_u8; 12];
    fs::File::open(&pack_path)
        .await?
        .read_exact(&mut header)
        .await?;
    if &header[..4] != b"PACK" {
        bail!("capture did not produce a Git pack")
    }
    let has_pack = u32::from_be_bytes(header[8..12].try_into()?) > 0;
    let (pack_id, expanded_bytes, object_count, largest_blob_bytes) = if has_pack {
        let index_path = directory.join("capture.idx");
        let output = Command::new("git")
            .args(["index-pack", "--strict", "--index-version=2", "-o"])
            .arg(&index_path)
            .arg(&pack_path)
            .output()
            .await?;
        if !output.status.success() {
            bail!(
                "captured pack failed validation: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )
        }
        let id = String::from_utf8(output.stdout)?.trim().to_owned();
        if !is_object_id(&id) {
            bail!("captured pack has an invalid identifier")
        }
        let (mut objects, expanded, largest_blob) = inspect_pack(&index_path).await?;
        populate_object_references(&repository_path, &mut objects).await?;
        fs::write(
            directory.join("capture.objects"),
            serde_json::to_vec(&objects)?,
        )
        .await?;
        let object_count = objects.len();
        (Some(id), expanded, object_count, largest_blob)
    } else {
        (None, 0, 0, 0)
    };
    Ok(axum::Json(Capture {
        refs,
        pack_bytes: metadata.len(),
        has_pack,
        pack_id,
        expanded_bytes,
        object_count,
        largest_blob_bytes,
    })
    .into_response())
}

pub(crate) async fn read_capture(
    State(state): State<Arc<AppState>>,
    Path((_owner, _repository, push, kind)): Path<(String, String, String, String)>,
    headers: HeaderMap,
) -> Response {
    storage_response(read_capture_inner(state, push, kind, headers).await)
}

pub(crate) async fn delete_capture(
    State(state): State<Arc<AppState>>,
    Path((_owner, _repository, push)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Response {
    if authorize(&state, &headers).is_err() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let path = match capture_path(&state, &push) {
        Ok(value) => value,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let _ = fs::remove_dir_all(path).await;
    StatusCode::NO_CONTENT.into_response()
}

async fn read_capture_inner(
    state: Arc<AppState>,
    push: String,
    kind: String,
    headers: HeaderMap,
) -> Result<Response> {
    authorize(&state, &headers)?;
    if !matches!(kind.as_str(), "pack" | "idx" | "objects") {
        bail!("invalid capture file")
    }
    let file = fs::File::open(capture_path(&state, &push)?.join(format!("capture.{kind}"))).await?;
    let bytes = file.metadata().await?.len();
    Ok(Response::builder()
        .header(
            "content-type",
            match kind.as_str() {
                "pack" => "application/x-git-packed-objects",
                "idx" => "application/x-git-packed-objects-toc",
                _ => "application/json",
            },
        )
        .header("content-length", bytes)
        .body(axum::body::Body::from_stream(
            tokio_util::io::ReaderStream::new(file),
        ))?)
}

async fn activate_inner(
    state: Arc<AppState>,
    owner: String,
    repository: String,
    headers: HeaderMap,
    activation: Activation,
) -> Result<Response> {
    authorize(&state, &headers)?;
    validate_repository(&owner, &repository)?;
    if activation.packs.len() > 16 {
        bail!("repository generation has too many packs")
    }
    for (name, object_id) in &activation.refs {
        if !safe_ref(name) || !name.starts_with("refs/") || !is_object_id(object_id) {
            bail!("repository generation contains an invalid ref")
        }
    }
    let repository_path = repository_path(&state.repositories, &owner, &repository)?;
    ensure_bare_repository(&repository_path).await?;
    let target = repository_path.join("objects/pack");
    let cache = pack_cache(&state, &owner, &repository)?;
    fs::create_dir_all(&target).await?;
    for pack in &activation.packs {
        if !is_object_id(pack) {
            bail!("repository generation contains an invalid pack")
        }
        for kind in ["pack", "idx"] {
            let source = cache.join(format!("pack-{pack}.{kind}"));
            if !fs::try_exists(&source).await? {
                bail!("repository pack {pack} is incomplete")
            }
            let destination = target.join(format!("pack-{pack}.{kind}"));
            if !fs::try_exists(&destination).await? {
                fs::hard_link(source, destination).await?;
            }
        }
        let output = Command::new("git")
            .args(["verify-pack", "-v"])
            .arg(target.join(format!("pack-{pack}.idx")))
            .output()
            .await?;
        if !output.status.success() {
            bail!("repository pack {pack} failed verification")
        }
    }
    remove_inactive_packs(&target, &activation.packs).await?;
    remove_loose_objects(&repository_path.join("objects")).await?;
    replace_refs(&repository_path, &activation.refs).await?;
    fs::write(
        repository_path.join("sty-generation"),
        activation.generation.to_string(),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn ensure_bare_repository(path: &std::path::Path) -> Result<()> {
    if fs::try_exists(path.join("HEAD")).await? {
        return Ok(());
    }
    fs::create_dir_all(path.parent().context("repository parent")?).await?;
    let output = Command::new("git")
        .args(["init", "--bare", "--initial-branch=main"])
        .arg(path)
        .output()
        .await?;
    if !output.status.success() {
        bail!(
            "git init failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
    }
    let output = Command::new("git")
        .args(["-C"])
        .arg(path)
        .args(["config", "http.receivepack", "true"])
        .output()
        .await?;
    if !output.status.success() {
        bail!("enable receive-pack failed")
    }
    Ok(())
}

async fn replace_refs(repository: &std::path::Path, refs: &BTreeMap<String, String>) -> Result<()> {
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["for-each-ref", "--format=%(refname)"])
        .output()
        .await?;
    if !output.status.success() {
        bail!("list repository refs failed")
    }
    let mut transaction = String::new();
    for name in String::from_utf8(output.stdout)?.lines() {
        if !refs.contains_key(name) {
            transaction.push_str(&format!("delete {name}\n"));
        }
    }
    for (name, object_id) in refs {
        transaction.push_str(&format!("update {name} {object_id}\n"));
    }
    if transaction.is_empty() {
        return Ok(());
    }
    let mut child = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["update-ref", "--stdin"])
        .stdin(std::process::Stdio::piped())
        .spawn()?;
    child
        .stdin
        .take()
        .context("open update-ref stdin")?
        .write_all(transaction.as_bytes())
        .await?;
    if !child.wait().await?.success() {
        bail!("replace repository refs failed")
    }
    Ok(())
}

async fn read_refs(repository: &std::path::Path) -> Result<BTreeMap<String, String>> {
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["for-each-ref", "--format=%(refname) %(objectname)"])
        .output()
        .await?;
    if !output.status.success() {
        bail!("read repository refs failed")
    }
    let mut refs = BTreeMap::new();
    for line in String::from_utf8(output.stdout)?.lines() {
        let (name, object_id) = line
            .split_once(' ')
            .context("invalid repository ref output")?;
        if !safe_ref(name) || !is_object_id(object_id) {
            bail!("repository contains an invalid ref")
        }
        refs.insert(name.to_owned(), object_id.to_owned());
    }
    Ok(refs)
}

async fn remove_inactive_packs(directory: &std::path::Path, active: &[String]) -> Result<()> {
    let mut entries = fs::read_dir(directory).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        let keep = active
            .iter()
            .any(|id| name == format!("pack-{id}.pack") || name == format!("pack-{id}.idx"));
        if !keep {
            fs::remove_file(entry.path()).await?;
        }
    }
    Ok(())
}

async fn remove_loose_objects(directory: &std::path::Path) -> Result<()> {
    let mut entries = fs::read_dir(directory).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        let loose = name.len() == 2 && name.bytes().all(|byte| byte.is_ascii_hexdigit());
        if loose || name.starts_with("incoming-") {
            fs::remove_dir_all(entry.path()).await?;
        }
    }
    Ok(())
}

async fn write_limited(request: Request, path: &std::path::Path, limit: u64) -> Result<()> {
    let stream = request
        .into_body()
        .into_data_stream()
        .map_err(std::io::Error::other);
    let mut reader = StreamReader::new(stream).take(limit + 1);
    let file_name = path
        .file_name()
        .context("repository pack filename")?
        .to_string_lossy();
    let temporary = path.with_file_name(format!("{file_name}.uploading"));
    let mut file = fs::File::create(&temporary).await?;
    let bytes = tokio::io::copy(&mut reader, &mut file).await?;
    file.flush().await?;
    if bytes > limit {
        let _ = fs::remove_file(temporary).await;
        bail!("repository pack exceeds its byte limit")
    }
    fs::rename(temporary, path).await?;
    Ok(())
}

fn validate_repository(owner: &str, repository: &str) -> Result<()> {
    if !safe_segment(owner) || !safe_segment(repository) {
        bail!("invalid repository")
    }
    Ok(())
}

fn pack_cache(state: &AppState, owner: &str, repository: &str) -> Result<PathBuf> {
    validate_repository(owner, repository)?;
    Ok(state
        .repositories
        .join(".sty-cache")
        .join(owner)
        .join(repository)
        .join("packs"))
}

fn capture_path(state: &AppState, push: &str) -> Result<PathBuf> {
    validate_push(push)?;
    Ok(state.repositories.join(".sty-captures").join(push))
}

fn validate_push(push: &str) -> Result<()> {
    if !(push.starts_with("push_") || push.starts_with("compact_"))
        || push.len() > 96
        || !push
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        bail!("invalid compatibility push")
    }
    Ok(())
}

fn authorize(state: &AppState, headers: &HeaderMap) -> Result<()> {
    if headers
        .get("x-sty-storage-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        bail!("storage route not found")
    }
    Ok(())
}

fn storage_response(result: Result<Response>) -> Response {
    match result {
        Ok(response) => response,
        Err(error) => {
            eprintln!("repository storage operation failed: {error:#}");
            (StatusCode::UNPROCESSABLE_ENTITY, error.to_string()).into_response()
        }
    }
}
