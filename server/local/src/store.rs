use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context, Result, anyhow, bail};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use sty_protocol::{
    ProjectMetadata, ProjectSummary, RemoteObject, SnapshotObject, TokenEntry, TokenFile,
    TokenPrincipal, is_hex_id, validate_segment,
};

pub struct Store {
    root: PathBuf,
    head_lock: Mutex<()>,
}

impl Store {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(root.join("tokens"))?;
        fs::create_dir_all(root.join("tenants"))?;
        Ok(Self {
            root,
            head_lock: Mutex::new(()),
        })
    }

    pub fn add_token(&self, user: &str) -> Result<String> {
        validate_segment(user)?;
        let token = format!("sty_dev_{}", Uuid::new_v4().simple());
        let mut file = self.tokens()?;
        file.tokens.push(TokenEntry {
            token_hash: self.token_hash(&token),
            user: user.to_string(),
        });
        self.write_json(&self.tokens_path(), &file)?;
        Ok(token)
    }

    pub fn principal_for_token(&self, token: &str) -> Result<Option<TokenPrincipal>> {
        let token_hash = self.token_hash(token);
        Ok(self
            .tokens()?
            .tokens
            .into_iter()
            .find(|entry| entry.token_hash == token_hash)
            .map(|entry| TokenPrincipal { user: entry.user }))
    }

    pub fn ensure_project(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<()> {
        self.ensure_project_storage(tenant, project)?;
        let metadata_path = self.project_metadata_path(tenant, project)?;
        if metadata_path.exists() {
            let metadata = self.project_metadata(tenant, project)?;
            self.require_project_access(&metadata, principal)?;
            return Ok(());
        }
        if tenant != principal.user {
            bail!(
                "user `{}` cannot create projects in tenant `{tenant}`",
                principal.user
            );
        }
        let metadata = ProjectMetadata {
            tenant: tenant.to_string(),
            project: project.to_string(),
            owner: principal.user.clone(),
        };
        self.write_json(&metadata_path, &metadata)?;
        Ok(())
    }

    pub fn projects(&self, principal: &TokenPrincipal) -> Result<Vec<ProjectSummary>> {
        let tenants_root = self.root.join("tenants");
        if !tenants_root.exists() {
            return Ok(Vec::new());
        }
        let mut projects = Vec::new();
        for tenant in fs::read_dir(tenants_root)? {
            let tenant = tenant?;
            if !tenant.file_type()?.is_dir() {
                continue;
            }
            let tenant_name = tenant.file_name().to_string_lossy().to_string();
            let projects_root = tenant.path().join("projects");
            if !projects_root.exists() {
                continue;
            }
            for project in fs::read_dir(projects_root)? {
                let project = project?;
                if !project.file_type()?.is_dir() {
                    continue;
                }
                let project_name = project.file_name().to_string_lossy().to_string();
                let metadata = self.project_metadata(&tenant_name, &project_name)?;
                if self.project_is_accessible(&metadata, principal) {
                    projects.push(ProjectSummary {
                        tenant: tenant_name.clone(),
                        project: project_name,
                        owner: metadata.owner,
                    });
                }
            }
        }
        projects.sort_by(|left, right| {
            (&left.tenant, &left.project).cmp(&(&right.tenant, &right.project))
        });
        Ok(projects)
    }

    pub fn head(&self, tenant: &str, project: &str, workspace: &str) -> Result<Option<String>> {
        self.ensure_project_storage(tenant, project)?;
        let path = self.head_path(tenant, project, workspace)?;
        if !path.exists() {
            return Ok(None);
        }
        let value = fs::read_to_string(path)?;
        let trimmed = value.trim();
        Ok((!trimmed.is_empty()).then(|| trimmed.to_string()))
    }

    pub fn compare(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        local_head: Option<&str>,
    ) -> Result<(Option<String>, String)> {
        let remote_head = self.head(tenant, project, workspace)?;
        let relation = match (local_head, remote_head.as_deref()) {
            (_, None) => "remote_missing",
            (Some(local), Some(remote)) if local == remote => "same",
            (None, Some(_)) => "remote_ahead",
            (Some(local), Some(remote)) if self.is_ancestor(tenant, project, remote, local)? => {
                "local_ahead"
            }
            (Some(local), Some(remote)) if self.is_ancestor(tenant, project, local, remote)? => {
                "remote_ahead"
            }
            (Some(local), Some(_)) if !self.object_exists(tenant, project, local)? => "local_ahead",
            _ => "diverged",
        };
        Ok((remote_head, relation.to_string()))
    }

    pub fn missing(&self, tenant: &str, project: &str, ids: &[String]) -> Result<Vec<String>> {
        self.ensure_project_storage(tenant, project)?;
        ids.iter()
            .filter_map(|id| match self.object_exists(tenant, project, id) {
                Ok(false) => Some(Ok(id.clone())),
                Ok(true) => None,
                Err(error) => Some(Err(error)),
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

    pub fn update_head(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        expected_head: Option<&str>,
        new_head: &str,
    ) -> Result<bool> {
        let _guard = self
            .head_lock
            .lock()
            .map_err(|_| anyhow!("head lock poisoned"))?;
        self.ensure_project_storage(tenant, project)?;
        if !self.object_exists(tenant, project, new_head)? {
            bail!("new head object is missing");
        }
        let current = self.head(tenant, project, workspace)?;
        if current.as_deref() != expected_head {
            return Ok(false);
        }
        fs::write(
            self.head_path(tenant, project, workspace)?,
            new_head.as_bytes(),
        )?;
        Ok(true)
    }

    fn is_ancestor(&self, tenant: &str, project: &str, ancestor: &str, head: &str) -> Result<bool> {
        let mut seen = BTreeSet::new();
        let mut stack = vec![head.to_string()];
        while let Some(id) = stack.pop() {
            if id == ancestor {
                return Ok(true);
            }
            if !seen.insert(id.clone()) {
                continue;
            }
            if !self.object_exists(tenant, project, &id)? {
                continue;
            }
            let kind = fs::read_to_string(self.object_kind_path(tenant, project, &id)?)?;
            if kind.trim() != "snapshot" {
                continue;
            }
            let bytes = fs::read(self.object_bytes_path(tenant, project, &id)?)?;
            let snapshot: SnapshotObject = serde_json::from_slice(&bytes)?;
            stack.extend(snapshot.parents);
        }
        Ok(false)
    }

    fn validate_object(&self, object: &RemoteObject) -> Result<()> {
        if !matches!(object.kind.as_str(), "blob" | "tree" | "snapshot") {
            bail!("unknown object kind `{}`", object.kind);
        }
        if !is_hex_id(&object.id) {
            bail!("invalid object id `{}`", object.id);
        }
        let bytes = BASE64
            .decode(&object.bytes_base64)
            .with_context(|| format!("invalid base64 payload for object {}", object.id))?;
        let digest = hex::encode(Sha256::digest(&bytes));
        if digest != object.id {
            bail!("object id does not match SHA-256 digest");
        }
        Ok(())
    }

    fn object_exists(&self, tenant: &str, project: &str, id: &str) -> Result<bool> {
        Ok(self.object_bytes_path(tenant, project, id)?.exists())
    }

    fn tokens(&self) -> Result<TokenFile> {
        let path = self.tokens_path();
        if !path.exists() {
            return Ok(TokenFile::default());
        }
        Ok(serde_json::from_slice(&fs::read(path)?)?)
    }

    fn write_json<T: serde::Serialize>(&self, path: &Path, value: &T) -> Result<()> {
        let bytes = serde_json::to_vec_pretty(value)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, bytes)?;
        Ok(())
    }

    fn ensure_project_storage(&self, tenant: &str, project: &str) -> Result<()> {
        let project = self.project_path(tenant, project)?;
        fs::create_dir_all(project.join("objects"))?;
        fs::create_dir_all(project.join("heads"))?;
        Ok(())
    }

    fn project_metadata(&self, tenant: &str, project: &str) -> Result<ProjectMetadata> {
        let path = self.project_metadata_path(tenant, project)?;
        if !path.exists() {
            return Ok(ProjectMetadata {
                tenant: tenant.to_string(),
                project: project.to_string(),
                owner: tenant.to_string(),
            });
        }
        Ok(serde_json::from_slice(&fs::read(path)?)?)
    }

    fn require_project_access(
        &self,
        metadata: &ProjectMetadata,
        principal: &TokenPrincipal,
    ) -> Result<()> {
        if self.project_is_accessible(metadata, principal) {
            return Ok(());
        }
        bail!(
            "user `{}` cannot access {}/{}",
            principal.user,
            metadata.tenant,
            metadata.project
        )
    }

    fn project_is_accessible(
        &self,
        metadata: &ProjectMetadata,
        principal: &TokenPrincipal,
    ) -> bool {
        metadata.owner == principal.user || metadata.tenant == principal.user
    }

    fn project_path(&self, tenant: &str, project: &str) -> Result<PathBuf> {
        Ok(self
            .root
            .join("tenants")
            .join(validate_segment_for_path(tenant)?)
            .join("projects")
            .join(validate_segment_for_path(project)?))
    }

    fn head_path(&self, tenant: &str, project: &str, workspace: &str) -> Result<PathBuf> {
        Ok(self
            .project_path(tenant, project)?
            .join("heads")
            .join(format!("{}.head", validate_segment_for_path(workspace)?)))
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

    fn tokens_path(&self) -> PathBuf {
        self.root.join("tokens").join("tokens.json")
    }

    fn project_metadata_path(&self, tenant: &str, project: &str) -> Result<PathBuf> {
        Ok(self.project_path(tenant, project)?.join("project.json"))
    }

    fn token_hash(&self, token: &str) -> String {
        hex::encode(Sha256::digest(token.as_bytes()))
    }
}

fn validate_segment_for_path(value: &str) -> Result<&str> {
    validate_segment(value)?;
    Ok(value)
}
