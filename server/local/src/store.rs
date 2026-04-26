pub use sty_store::sqlite::SqliteStore as Store;

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use sha2::{Digest, Sha256};
use sty_protocol::{RemoteObject, is_hex_id, validate_segment};

pub struct ObjectStore {
    root: PathBuf,
}

impl ObjectStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn missing(&self, tenant: &str, project: &str, ids: &[String]) -> Result<Vec<String>> {
        self.ensure_project_storage(tenant, project)?;
        ids.iter()
            .filter_map(|id| match self.object_exists(tenant, project, id) {
                Ok(false) => Some(Ok(id.clone())),
                Ok(true) => None,
                Err(err) => Some(Err(err)),
            })
            .collect()
    }

    pub fn upload(&self, tenant: &str, project: &str, objects: &[RemoteObject]) -> Result<()> {
        self.ensure_project_storage(tenant, project)?;
        for object in objects {
            self.validate_object(object)?;
            let bytes = BASE64
                .decode(&object.bytes_base64)
                .with_context(|| format!("invalid base64 payload for object {}", object.id))?;
            let bytes_path = self.object_bytes_path(tenant, project, &object.id)?;
            let kind_path = self.object_kind_path(tenant, project, &object.id)?;
            if bytes_path.exists() {
                continue;
            }
            fs::write(bytes_path, bytes)?;
            fs::write(kind_path, object.kind.as_bytes())?;
        }
        Ok(())
    }

    pub fn upload_chunk(
        &self,
        tenant: &str,
        project: &str,
        id: &str,
        kind: &str,
        chunk_index: usize,
        chunk_count: usize,
        total_size: usize,
        bytes: &[u8],
    ) -> Result<()> {
        self.ensure_project_storage(tenant, project)?;
        self.validate_object_metadata(id, kind)?;
        if chunk_count == 0 {
            bail!("chunk_count must be greater than zero");
        }
        if chunk_index >= chunk_count {
            bail!("chunk index is out of range");
        }
        if total_size == 0 {
            bail!("total_size must be greater than zero");
        }
        if self.object_exists(tenant, project, id)? {
            return Ok(());
        }
        let chunk_path = self.object_chunk_path(tenant, project, id, chunk_index)?;
        if let Some(parent) = chunk_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(chunk_path, bytes)?;
        Ok(())
    }

    pub fn complete_chunked_upload(
        &self,
        tenant: &str,
        project: &str,
        id: &str,
        kind: &str,
        total_size: usize,
        chunk_count: usize,
    ) -> Result<()> {
        self.ensure_project_storage(tenant, project)?;
        self.validate_object_metadata(id, kind)?;
        if chunk_count == 0 {
            bail!("chunk_count must be greater than zero");
        }
        let bytes_path = self.object_bytes_path(tenant, project, id)?;
        let kind_path = self.object_kind_path(tenant, project, id)?;
        if bytes_path.exists() {
            self.remove_object_chunks(tenant, project, id).ok();
            return Ok(());
        }
        let mut bytes = Vec::with_capacity(total_size);
        for chunk_index in 0..chunk_count {
            let chunk_path = self.object_chunk_path(tenant, project, id, chunk_index)?;
            if !chunk_path.exists() {
                bail!("missing chunk {chunk_index} for object {id}");
            }
            bytes.extend(fs::read(chunk_path)?);
        }
        if bytes.len() != total_size {
            bail!("chunked object size does not match declared total size");
        }
        let digest = hex::encode(Sha256::digest(&bytes));
        if digest != id {
            bail!("object id does not match SHA-256 digest");
        }
        fs::write(bytes_path, bytes)?;
        fs::write(kind_path, kind.as_bytes())?;
        self.remove_object_chunks(tenant, project, id).ok();
        Ok(())
    }

    pub fn download(
        &self,
        tenant: &str,
        project: &str,
        ids: &[String],
    ) -> Result<Vec<RemoteObject>> {
        self.ensure_project_storage(tenant, project)?;
        let mut objects = Vec::new();
        for id in ids {
            let bytes_path = self.object_bytes_path(tenant, project, id)?;
            let kind_path = self.object_kind_path(tenant, project, id)?;
            if !bytes_path.exists() || !kind_path.exists() {
                continue;
            }
            let bytes = fs::read(bytes_path)?;
            let kind = fs::read_to_string(kind_path)?.trim().to_string();
            objects.push(RemoteObject {
                id: id.clone(),
                kind,
                bytes_base64: BASE64.encode(bytes),
            });
        }
        Ok(objects)
    }

    fn validate_object(&self, object: &RemoteObject) -> Result<()> {
        self.validate_object_metadata(&object.id, &object.kind)?;
        let bytes = BASE64
            .decode(&object.bytes_base64)
            .with_context(|| format!("invalid base64 payload for object {}", object.id))?;
        let digest = hex::encode(Sha256::digest(&bytes));
        if digest != object.id {
            bail!("object id does not match SHA-256 digest");
        }
        Ok(())
    }

    fn validate_object_metadata(&self, id: &str, kind: &str) -> Result<()> {
        if !matches!(kind, "blob" | "tree" | "snapshot") {
            bail!("unknown object kind `{kind}`");
        }
        if !is_hex_id(id) {
            bail!("invalid object id `{id}`");
        }
        Ok(())
    }

    fn object_exists(&self, tenant: &str, project: &str, id: &str) -> Result<bool> {
        Ok(self.object_bytes_path(tenant, project, id)?.exists())
    }

    fn ensure_project_storage(&self, tenant: &str, project: &str) -> Result<()> {
        let project = self.project_path(tenant, project)?;
        fs::create_dir_all(project.join("objects"))?;
        fs::create_dir_all(project.join("heads"))?;
        Ok(())
    }

    fn project_path(&self, tenant: &str, project: &str) -> Result<PathBuf> {
        validate_segment(tenant)?;
        validate_segment(project)?;
        Ok(self
            .root
            .join("tenants")
            .join(tenant)
            .join("projects")
            .join(project))
    }

    fn object_bytes_path(&self, tenant: &str, project: &str, id: &str) -> Result<PathBuf> {
        Ok(self.project_path(tenant, project)?.join("objects").join(id))
    }

    fn object_kind_path(&self, tenant: &str, project: &str, id: &str) -> Result<PathBuf> {
        Ok(self
            .project_path(tenant, project)?
            .join("objects")
            .join(format!("{id}.kind")))
    }

    fn object_chunk_path(
        &self,
        tenant: &str,
        project: &str,
        id: &str,
        chunk_index: usize,
    ) -> Result<PathBuf> {
        validate_segment(id)?;
        Ok(self
            .project_path(tenant, project)?
            .join("objects")
            .join(".uploads")
            .join(id)
            .join(format!("{chunk_index}.chunk")))
    }

    fn remove_object_chunks(&self, tenant: &str, project: &str, id: &str) -> Result<()> {
        validate_segment(id)?;
        let upload_dir = self
            .project_path(tenant, project)?
            .join("objects")
            .join(".uploads")
            .join(id);
        if upload_dir.exists() {
            fs::remove_dir_all(upload_dir)?;
        }
        Ok(())
    }
}
