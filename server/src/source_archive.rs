use futures_util::{StreamExt, stream};
use sty_protocol::TreeEntryInfo;
use worker::*;

use crate::request_context::AppRouteContext;
use crate::support::{
    apply_cache_headers, bucket, db, json_error, not_modified_response, object_key, project_params,
    r2_bytes, validate_object_id,
};

pub(crate) async fn source_zip_bytes_for_snapshot(
    store: &Bucket,
    tenant: &str,
    project: &str,
    snapshot_id: &str,
) -> Result<Vec<u8>> {
    validate_object_id(snapshot_id)?;
    let snapshot_bytes = r2_bytes(store, &object_key(tenant, project, snapshot_id)).await?;
    let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes)
        .map_err(|error| Error::RustError(error.to_string()))?;
    let root_tree = snapshot["root_tree"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    validate_object_id(&root_tree)?;
    let mut entries = Vec::new();
    crate::walk_tree(store, tenant, project, "", &root_tree, &mut entries).await?;
    let files = entries
        .into_iter()
        .filter(|entry| entry.entry_type == "blob")
        .collect::<Vec<_>>();
    source_zip_bytes(store, tenant, project, files).await
}

pub(crate) async fn project_source_archive(req: Request, ctx: AppRouteContext) -> Result<Response> {
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    let url = req.url()?;
    let workspace = url
        .query_pairs()
        .find_map(|(key, value)| (key == "workspace").then(|| value.to_string()))
        .unwrap_or_else(|| "main".to_string());
    let snapshot_param = url
        .query_pairs()
        .find_map(|(key, value)| (key == "snapshot").then(|| value.to_string()));
    let pinned_snapshot = snapshot_param.is_some();
    let released_snapshot = match snapshot_param.as_deref() {
        Some(snapshot) => {
            validate_object_id(snapshot)?;
            crate::release_support::release_snapshot_is_published(
                database, &tenant, &project, snapshot,
            )
            .await?
        }
        None => false,
    };
    let project_public = matches!(
        crate::d1::project_visibility(database, &tenant, &project).await?,
        Some(visibility) if visibility == "public"
    );
    let release_public = released_snapshot
        && (project_public
            || crate::d1::project_public_releases(database, &tenant, &project).await?);
    let user = if release_public {
        crate::optional_auth(&req, &ctx).await.unwrap_or(None)
    } else {
        crate::optional_auth(&req, &ctx).await?
    };
    if !release_public {
        crate::check_workspace_read_capability(
            database,
            &tenant,
            &project,
            user.as_deref(),
            &workspace,
        )
        .await?;
    }
    let head_id = if let Some(snapshot) = snapshot_param {
        snapshot
    } else {
        let head = crate::d1::head(database, &tenant, &project, &workspace).await?;
        match head {
            Some(value) => value,
            None => return json_error(404, "workspace has no head"),
        }
    };
    validate_object_id(&head_id)?;
    let public_cache = project_public || release_public;
    let etag = format!("{head_id}-source-zip");
    let cache_seconds = if pinned_snapshot { 31_536_000 } else { 60 };
    if let Some(response) =
        not_modified_response(&req, &etag, public_cache, cache_seconds, pinned_snapshot)?
    {
        return Ok(response);
    }
    let store = bucket(&ctx.env)?;
    let cache_key =
        released_snapshot.then(|| release_source_cache_key(&tenant, &project, &head_id));
    if let Some(cache_key) = cache_key.as_deref() {
        if let Some(object) = store.get(cache_key).execute().await? {
            if let Some(body) = object.body() {
                let mut response = Response::from_body(body.response_body()?)?;
                let headers = response.headers_mut();
                headers.set("content-type", "application/zip")?;
                headers.set(
                    "content-disposition",
                    &format!(
                        "attachment; filename=\"{}\"",
                        crate::release_support::safe_file_name(&format!("{tenant}-{project}.zip"))
                    ),
                )?;
                apply_cache_headers(
                    headers,
                    object.etag().as_str(),
                    public_cache,
                    cache_seconds,
                    pinned_snapshot,
                )?;
                return Ok(response);
            }
        }
    }
    if let Some(cache_key) = cache_key {
        let bytes = source_zip_bytes_for_snapshot(&store, &tenant, &project, &head_id).await?;
        let metadata = HttpMetadata {
            content_type: Some("application/zip".to_string()),
            content_disposition: Some(format!(
                "attachment; filename=\"{}\"",
                crate::release_support::safe_file_name(&format!("{tenant}-{project}.zip"))
            )),
            ..Default::default()
        };
        store
            .put(cache_key, bytes.clone())
            .http_metadata(metadata)
            .execute()
            .await?;
        let mut response = Response::from_bytes(bytes)?;
        let headers = response.headers_mut();
        headers.set("content-type", "application/zip")?;
        headers.set(
            "content-disposition",
            &format!(
                "attachment; filename=\"{}\"",
                crate::release_support::safe_file_name(&format!("{tenant}-{project}.zip"))
            ),
        )?;
        apply_cache_headers(headers, &etag, public_cache, cache_seconds, pinned_snapshot)?;
        return Ok(response);
    }
    let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &head_id)).await?;
    let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes)
        .map_err(|error| Error::RustError(error.to_string()))?;
    let root_tree = snapshot["root_tree"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    validate_object_id(&root_tree)?;
    let mut entries = Vec::new();
    crate::walk_tree(&store, &tenant, &project, "", &root_tree, &mut entries).await?;
    let files = entries
        .into_iter()
        .filter(|entry| entry.entry_type == "blob")
        .collect::<Vec<_>>();
    let stream = source_zip_stream(store, tenant.clone(), project.clone(), files);
    let mut response = Response::from_stream(stream)?;
    let headers = response.headers_mut();
    headers.set("content-type", "application/zip")?;
    headers.set(
        "content-disposition",
        &format!(
            "attachment; filename=\"{}\"",
            crate::release_support::safe_file_name(&format!("{tenant}-{project}.zip"))
        ),
    )?;
    apply_cache_headers(headers, &etag, public_cache, cache_seconds, pinned_snapshot)?;
    Ok(response)
}

fn release_source_cache_key(tenant: &str, project: &str, snapshot: &str) -> String {
    format!("projects/{tenant}/{project}/source-archives/{snapshot}.zip")
}

async fn source_zip_bytes(
    store: &Bucket,
    tenant: &str,
    project: &str,
    files: Vec<TreeEntryInfo>,
) -> Result<Vec<u8>> {
    let mut output = Vec::new();
    let mut central = Vec::new();
    let mut offset = 0u64;
    for entry in files {
        let name = source_zip_name(&entry.path)?;
        let header = source_zip_local_header(&name)?;
        let local_header_offset = offset;
        offset = checked_zip_offset(offset + header.len() as u64)?;
        output.extend_from_slice(&header);

        let bytes = r2_bytes(store, &object_key(tenant, project, &entry.id)).await?;
        let size = checked_zip_size(bytes.len() as u64)?;
        let mut crc = Crc32::new();
        crc.update(&bytes);
        let crc = crc.finish();
        offset = checked_zip_offset(offset + size)?;
        output.extend_from_slice(&bytes);

        let descriptor = source_zip_data_descriptor(crc, size)?;
        offset = checked_zip_offset(offset + descriptor.len() as u64)?;
        output.extend_from_slice(&descriptor);
        central.push(SourceZipCentralRecord {
            name,
            crc,
            size,
            local_header_offset,
        });
    }
    let central_directory = source_zip_central_directory(&central, offset)?;
    output.extend_from_slice(&central_directory);
    Ok(output)
}

fn source_zip_stream(
    store: Bucket,
    tenant: String,
    project: String,
    files: Vec<TreeEntryInfo>,
) -> impl futures_util::TryStream<Ok = Vec<u8>, Error = Error> {
    stream::try_unfold(
        SourceZipState {
            store,
            tenant,
            project,
            files,
            index: 0,
            offset: 0,
            central: Vec::new(),
            phase: SourceZipPhase::StartFile,
        },
        |state| async move { state.next_chunk().await },
    )
}

struct SourceZipState {
    store: Bucket,
    tenant: String,
    project: String,
    files: Vec<TreeEntryInfo>,
    index: usize,
    offset: u64,
    central: Vec<SourceZipCentralRecord>,
    phase: SourceZipPhase,
}

enum SourceZipPhase {
    StartFile,
    StreamFile(SourceZipFileStream),
    Done,
}

struct SourceZipFileStream {
    name: Vec<u8>,
    stream: ByteStream,
    crc: Crc32,
    size: u64,
    local_header_offset: u64,
}

struct SourceZipCentralRecord {
    name: Vec<u8>,
    crc: u32,
    size: u64,
    local_header_offset: u64,
}

impl SourceZipState {
    async fn next_chunk(mut self) -> Result<Option<(Vec<u8>, Self)>> {
        loop {
            match std::mem::replace(&mut self.phase, SourceZipPhase::Done) {
                SourceZipPhase::StartFile => {
                    let Some(entry) = self.files.get(self.index).cloned() else {
                        let central = source_zip_central_directory(&self.central, self.offset)?;
                        self.phase = SourceZipPhase::Done;
                        return Ok(Some((central, self)));
                    };
                    let name = source_zip_name(&entry.path)?;
                    let key = object_key(&self.tenant, &self.project, &entry.id);
                    let Some(object) = self.store.get(key).execute().await? else {
                        return Err(Error::RustError(format!("missing object {}", entry.id)));
                    };
                    let Some(body) = object.body() else {
                        return Err(Error::RustError(format!(
                            "missing object body {}",
                            entry.id
                        )));
                    };
                    let header = source_zip_local_header(&name)?;
                    let local_header_offset = self.offset;
                    self.offset = checked_zip_offset(self.offset + header.len() as u64)?;
                    self.phase = SourceZipPhase::StreamFile(SourceZipFileStream {
                        name,
                        stream: body.stream()?,
                        crc: Crc32::new(),
                        size: 0,
                        local_header_offset,
                    });
                    return Ok(Some((header, self)));
                }
                SourceZipPhase::StreamFile(mut file) => match file.stream.next().await {
                    Some(Ok(chunk)) => {
                        file.size = checked_zip_size(file.size + chunk.len() as u64)?;
                        file.crc.update(&chunk);
                        self.offset = checked_zip_offset(self.offset + chunk.len() as u64)?;
                        self.phase = SourceZipPhase::StreamFile(file);
                        return Ok(Some((chunk, self)));
                    }
                    Some(Err(error)) => return Err(error),
                    None => {
                        let crc = file.crc.finish();
                        let descriptor = source_zip_data_descriptor(crc, file.size)?;
                        self.offset = checked_zip_offset(self.offset + descriptor.len() as u64)?;
                        self.central.push(SourceZipCentralRecord {
                            name: file.name,
                            crc,
                            size: file.size,
                            local_header_offset: file.local_header_offset,
                        });
                        self.index += 1;
                        self.phase = SourceZipPhase::StartFile;
                        return Ok(Some((descriptor, self)));
                    }
                },
                SourceZipPhase::Done => return Ok(None),
            }
        }
    }
}

fn source_zip_name(path: &str) -> Result<Vec<u8>> {
    let name = path.as_bytes().to_vec();
    if name.is_empty() || name.len() > u16::MAX as usize {
        return Err(Error::RustError(
            "file path is too long for zip".to_string(),
        ));
    }
    Ok(name)
}

fn source_zip_local_header(name: &[u8]) -> Result<Vec<u8>> {
    let mut header = Vec::with_capacity(30 + name.len());
    push_u32_le(&mut header, 0x0403_4b50);
    push_u16_le(&mut header, 20);
    push_u16_le(&mut header, 0x0808);
    push_u16_le(&mut header, 0);
    push_u16_le(&mut header, 0);
    push_u16_le(&mut header, 0);
    push_u32_le(&mut header, 0);
    push_u32_le(&mut header, 0);
    push_u32_le(&mut header, 0);
    push_u16_le(&mut header, checked_zip_name_len(name)?);
    push_u16_le(&mut header, 0);
    header.extend_from_slice(name);
    Ok(header)
}

fn source_zip_data_descriptor(crc: u32, size: u64) -> Result<Vec<u8>> {
    let size = checked_zip_u32(size)?;
    let mut descriptor = Vec::with_capacity(16);
    push_u32_le(&mut descriptor, 0x0807_4b50);
    push_u32_le(&mut descriptor, crc);
    push_u32_le(&mut descriptor, size);
    push_u32_le(&mut descriptor, size);
    Ok(descriptor)
}

fn source_zip_central_directory(
    records: &[SourceZipCentralRecord],
    central_offset: u64,
) -> Result<Vec<u8>> {
    let count = u16::try_from(records.len())
        .map_err(|_| Error::RustError("source archive has too many files".to_string()))?;
    let central_offset = checked_zip_u32(central_offset)?;
    let mut directory = Vec::new();
    for record in records {
        let size = checked_zip_u32(record.size)?;
        let local_header_offset = checked_zip_u32(record.local_header_offset)?;
        push_u32_le(&mut directory, 0x0201_4b50);
        push_u16_le(&mut directory, 20);
        push_u16_le(&mut directory, 20);
        push_u16_le(&mut directory, 0x0808);
        push_u16_le(&mut directory, 0);
        push_u16_le(&mut directory, 0);
        push_u16_le(&mut directory, 0);
        push_u32_le(&mut directory, record.crc);
        push_u32_le(&mut directory, size);
        push_u32_le(&mut directory, size);
        push_u16_le(&mut directory, checked_zip_name_len(&record.name)?);
        push_u16_le(&mut directory, 0);
        push_u16_le(&mut directory, 0);
        push_u16_le(&mut directory, 0);
        push_u16_le(&mut directory, 0);
        push_u32_le(&mut directory, 0);
        push_u32_le(&mut directory, local_header_offset);
        directory.extend_from_slice(&record.name);
    }
    let central_size = checked_zip_u32(directory.len() as u64)?;
    checked_zip_offset(u64::from(central_offset) + u64::from(central_size) + 22)?;
    push_u32_le(&mut directory, 0x0605_4b50);
    push_u16_le(&mut directory, 0);
    push_u16_le(&mut directory, 0);
    push_u16_le(&mut directory, count);
    push_u16_le(&mut directory, count);
    push_u32_le(&mut directory, central_size);
    push_u32_le(&mut directory, central_offset);
    push_u16_le(&mut directory, 0);
    Ok(directory)
}

fn checked_zip_name_len(name: &[u8]) -> Result<u16> {
    u16::try_from(name.len())
        .map_err(|_| Error::RustError("file path is too long for zip".to_string()))
}

fn checked_zip_size(value: u64) -> Result<u64> {
    if value <= u32::MAX as u64 {
        Ok(value)
    } else {
        Err(Error::RustError(
            "file is too large for zip download".to_string(),
        ))
    }
}

fn checked_zip_offset(value: u64) -> Result<u64> {
    if value <= u32::MAX as u64 {
        Ok(value)
    } else {
        Err(Error::RustError(
            "source archive is too large for zip download".to_string(),
        ))
    }
}

fn checked_zip_u32(value: u64) -> Result<u32> {
    u32::try_from(value)
        .map_err(|_| Error::RustError("source archive is too large for zip download".to_string()))
}

fn push_u16_le(output: &mut Vec<u8>, value: u16) {
    output.extend_from_slice(&value.to_le_bytes());
}

fn push_u32_le(output: &mut Vec<u8>, value: u32) {
    output.extend_from_slice(&value.to_le_bytes());
}

struct Crc32 {
    value: u32,
}

impl Crc32 {
    fn new() -> Self {
        Self { value: 0xffff_ffff }
    }

    fn update(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.value ^= u32::from(*byte);
            for _ in 0..8 {
                let mask = 0u32.wrapping_sub(self.value & 1);
                self.value = (self.value >> 1) ^ (0xedb8_8320 & mask);
            }
        }
    }

    fn finish(self) -> u32 {
        !self.value
    }
}
