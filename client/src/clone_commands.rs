use std::fs::File;
use std::io::{Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use reqwest::blocking::{Client, RequestBuilder};
use sty_protocol::{is_hex_id, validate_segment, validate_target};
use url::Url;
use zip::ZipArchive;

use crate::auth_commands::{DEFAULT_REMOTE_URL, try_load_config};
use crate::http::response_error;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);

pub(crate) fn clone_project(
    source: String,
    path: Option<PathBuf>,
    workspace: String,
    snapshot: Option<String>,
    force: bool,
    remote_url: Option<String>,
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

    let session = CloneSession::new(remote_url)?;
    let archive =
        session.download_source_archive(tenant, project, &workspace, snapshot.as_deref())?;
    let file_count = extract_source_archive(archive, &destination, force)?;

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
    fn new(remote_url: Option<String>) -> Result<Self> {
        let config = try_load_config();
        let remote_url = remote_url
            .or_else(|| config.as_ref().map(|config| config.remote_url.clone()))
            .unwrap_or_else(|| DEFAULT_REMOTE_URL.to_string());
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

    fn auth(&self, request: RequestBuilder) -> RequestBuilder {
        match self.token.as_deref() {
            Some(token) => request.bearer_auth(token),
            None => request,
        }
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
            bail!("destination exists and is not a directory: {}", path.display());
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
