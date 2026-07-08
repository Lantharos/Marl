use std::fs::File;
use std::io::{Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use reqwest::blocking::{Client, RequestBuilder};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use sty_protocol::{
    DownloadRequest, DownloadResponse, PathClosureRequest, PathClosureResponse, is_hex_id,
    validate_segment, validate_target,
};
use url::Url;
use zip::ZipArchive;

use crate::auth_commands::try_load_config;
use crate::http::response_error;
use crate::remote::{resolve_remote_url};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);

pub(crate) fn clone_project(
    source: String,
    path: Option<PathBuf>,
    workspace: String,
    snapshot: Option<String>,
    include: Option<String>,
    force: bool,
    remote_url: Option<String>,
    port: Option<u16>,
) -> Result<()> {
    let (tenant, project) = validate_target(&source)?;
    validate_segment(&workspace)?;
    if let Some(snapshot) = snapshot.as_deref() {
        if !is_hex_id(snapshot) {
            bail!("invalid snapshot id `{snapshot}`");
        }
    }
    let destination = path.unwrap_or_else(|| PathBuf::from(project));
    prepare_destination(&destination, force)?;

    let session = CloneSession::new(remote_url, port)?;
    let file_count = if let Some(include) = include.as_deref() {
        session.download_path(
            tenant,
            project,
            &workspace,
            snapshot.as_deref(),
            include,
            &destination,
            force,
        )?
    } else {
        let archive =
            session.download_source_archive(tenant, project, &workspace, snapshot.as_deref())?;
        extract_source_archive(archive, &destination, force)?
    };

    println!(
        "Downloaded {} {} from {}/{} into {}",
        file_count,
        if file_count == 1 { "file" } else { "files" },
        tenant,
        project,
        destination.display()
    );
    println!("No fork was created and no PIG remote was configured.");
    Ok(())
}

struct CloneSession {
    remote_url: String,
    token: Option<String>,
    client: Client,
}

impl CloneSession {
    fn new(remote_url: Option<String>, port: Option<u16>) -> Result<Self> {
        let config = try_load_config();
        let remote_url = if remote_url.is_some() || port.is_some() {
            resolve_remote_url(remote_url.as_deref(), port)
        } else if let Some(config) = &config {
            config.remote_url.clone()
        } else {
            resolve_remote_url(None, None)
        };
        let token = config
            .filter(|config| same_remote(&config.remote_url, &remote_url))
            .map(|config| config.token);
        Ok(Self {
            remote_url,
            token,
            client: Client::builder().timeout(REQUEST_TIMEOUT).build()?,
        })
    }

    fn download_source_archive(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        snapshot: Option<&str>,
    ) -> Result<File> {
        let mut url = Url::parse(&format!(
            "{}/v1/tenants/{}/projects/{}/source.zip",
            self.remote_url.trim_end_matches('/'),
            tenant,
            project
        ))?;
        {
            let mut query = url.query_pairs_mut();
            query.append_pair("workspace", workspace);
            if let Some(snapshot) = snapshot {
                query.append_pair("snapshot", snapshot);
            }
        }
        let mut response = self
            .auth(self.client.get(url))
            .send()
            .context("failed to download source archive")?;
        if !response.status().is_success() {
            bail!("clone failed with status {}", response_error(response));
        }
        let mut archive = tempfile::tempfile().context("failed to create temporary archive")?;
        response
            .copy_to(&mut archive)
            .context("failed to write source archive")?;
        archive.seek(SeekFrom::Start(0))?;
        Ok(archive)
    }

    fn download_path(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        snapshot: Option<&str>,
        include: &str,
        destination: &Path,
        force: bool,
    ) -> Result<usize> {
        let closure = self.path_closure(tenant, project, workspace, snapshot, include)?;
        let ids = closure
            .files
            .iter()
            .map(|file| file.id.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let objects = self.download_objects(tenant, project, &ids)?;
        let mut file_count = 0usize;
        for file in closure.files {
            let bytes = objects
                .get(&file.id)
                .ok_or_else(|| anyhow::anyhow!("remote did not return object {}", file.id))?;
            let target = destination_path(destination, &file.path)?;
            if target.exists() && !force {
                bail!("refusing to overwrite {}", target.display());
            }
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&target, bytes)
                .with_context(|| format!("failed to write {}", target.display()))?;
            file_count += 1;
        }
        Ok(file_count)
    }

    fn path_closure(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        snapshot: Option<&str>,
        include: &str,
    ) -> Result<PathClosureResponse> {
        let response = self
            .auth(
                self.client
                    .post(self.project_url(tenant, project, "/objects/path-closure")?),
            )
            .json(&PathClosureRequest {
                workspace: Some(workspace.to_string()),
                snapshot: snapshot.map(ToOwned::to_owned),
                path: include.to_string(),
            })
            .send()
            .context("failed to request path closure")?;
        if !response.status().is_success() {
            bail!("clone failed with status {}", response_error(response));
        }
        response
            .json()
            .context("failed to read path closure response")
    }

    fn download_objects(
        &self,
        tenant: &str,
        project: &str,
        ids: &[String],
    ) -> Result<BTreeMap<String, Vec<u8>>> {
        let mut objects = BTreeMap::new();
        for chunk in ids.chunks(96) {
            let response = self
                .auth(
                    self.client
                        .post(self.project_url(tenant, project, "/objects/download")?),
                )
                .json(&DownloadRequest {
                    ids: chunk.to_vec(),
                })
                .send()
                .context("failed to download objects")?;
            if !response.status().is_success() {
                bail!("clone failed with status {}", response_error(response));
            }
            let response: DownloadResponse = response
                .json()
                .context("failed to read object download response")?;
            for object in response.objects {
                if object.kind != "blob" {
                    bail!("path clone expected a blob object, got {}", object.kind);
                }
                let bytes = BASE64_STANDARD
                    .decode(object.bytes_base64)
                    .context("failed to decode object bytes")?;
                let digest = hex::encode(Sha256::digest(&bytes));
                if digest != object.id {
                    bail!(
                        "remote object {} does not match its content digest",
                        object.id
                    );
                }
                objects.insert(object.id, bytes);
            }
        }
        Ok(objects)
    }

    fn auth(&self, request: RequestBuilder) -> RequestBuilder {
        match self.token.as_deref() {
            Some(token) => request.bearer_auth(token),
            None => request,
        }
    }

    fn project_url(&self, tenant: &str, project: &str, path: &str) -> Result<String> {
        Ok(format!(
            "{}/v1/tenants/{}/projects/{}{}",
            self.remote_url.trim_end_matches('/'),
            tenant,
            project,
            path
        ))
    }
}

fn extract_source_archive(archive: File, destination: &Path, force: bool) -> Result<usize> {
    let mut archive = ZipArchive::new(archive).context("failed to read source archive")?;
    if archive
        .has_overlapping_files()
        .context("failed to validate source archive")?
    {
        bail!("source archive contains overlapping files");
    }
    let mut file_count = 0usize;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .with_context(|| format!("failed to read archive entry {index}"))?;
        if file.is_dir() {
            continue;
        }
        if file.encrypted() {
            bail!("source archive contains encrypted file `{}`", file.name());
        }
        if file.is_symlink() {
            bail!("source archive contains symlink `{}`", file.name());
        }
        if file.enclosed_name().is_none() {
            bail!("source archive contains unsafe path `{}`", file.name());
        }
        let target = destination_path(destination, file.name())?;
        if target.exists() && !force {
            bail!("refusing to overwrite {}", target.display());
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut output = File::create(&target)
            .with_context(|| format!("failed to create {}", target.display()))?;
        std::io::copy(&mut file, &mut output)
            .with_context(|| format!("failed to extract {}", target.display()))?;
        file_count += 1;
    }
    Ok(file_count)
}

fn prepare_destination(path: &Path, force: bool) -> Result<()> {
    if path.exists() {
        if !path.is_dir() {
            bail!(
                "destination exists and is not a directory: {}",
                path.display()
            );
        }
        if !force && path.read_dir()?.next().is_some() {
            bail!(
                "destination is not empty: {}. Pass --force to overwrite downloaded files.",
                path.display()
            );
        }
        return Ok(());
    }
    std::fs::create_dir_all(path)?;
    Ok(())
}

fn destination_path(destination: &Path, remote_path: &str) -> Result<PathBuf> {
    let mut target = destination.to_path_buf();
    let mut parts = 0usize;
    for part in remote_path.split('/') {
        validate_safe_path_part(part)?;
        target.push(part);
        parts += 1;
    }
    if parts == 0 {
        bail!("unsafe empty path in remote tree");
    }
    Ok(target)
}

fn validate_safe_path_part(part: &str) -> Result<()> {
    if part.is_empty()
        || part == "."
        || part == ".."
        || part.contains('\\')
        || part.contains(':')
        || part.contains('\0')
        || part.chars().any(char::is_control)
    {
        bail!("unsafe path segment `{part}` in remote tree");
    }
    Ok(())
}

fn same_remote(left: &str, right: &str) -> bool {
    left.trim_end_matches('/') == right.trim_end_matches('/')
}
