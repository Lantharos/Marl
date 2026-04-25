use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use anyhow::{Context, Result, anyhow, bail};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use sty_protocol::{
    HistoryEntry, Issue, ProjectMetadata, ProjectSettings, ProjectSummary, RemoteObject,
    SnapshotObject, TokenEntry, TokenFile, TokenPrincipal, WorkspaceState, is_hex_id, validate_segment,
};

mod tenants;

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
        self.ensure_user_tenant(user)?;
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
        if !self.tenant_is_accessible(tenant, principal)? {
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
                if self.project_is_accessible(&metadata, principal)? {
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

    pub fn root(&self) -> &Path {
        &self.root
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
        if self.project_is_accessible(metadata, principal)? {
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
    ) -> Result<bool> {
        Ok(metadata.owner == principal.user
            || self.tenant_is_accessible(&metadata.tenant, principal)?)
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

    fn object_chunk_path(
        &self,
        tenant: &str,
        project: &str,
        id: &str,
        chunk_index: usize,
    ) -> Result<PathBuf> {
        Ok(self
            .project_path(tenant, project)?
            .join("objects")
            .join(".uploads")
            .join(validate_segment_for_path(id)?)
            .join(format!("{chunk_index}.chunk")))
    }

    fn remove_object_chunks(&self, tenant: &str, project: &str, id: &str) -> Result<()> {
        let upload_dir = self
            .project_path(tenant, project)?
            .join("objects")
            .join(".uploads")
            .join(validate_segment_for_path(id)?);
        if upload_dir.exists() {
            fs::remove_dir_all(upload_dir)?;
        }
        Ok(())
    }

    fn tokens_path(&self) -> PathBuf {
        self.root.join("tokens").join("tokens.json")
    }

    fn tenant_metadata_path(&self, tenant: &str) -> Result<PathBuf> {
        Ok(self
            .root
            .join("tenants")
            .join(validate_segment_for_path(tenant)?)
            .join("tenant.json"))
    }

    fn project_metadata_path(&self, tenant: &str, project: &str) -> Result<PathBuf> {
        Ok(self.project_path(tenant, project)?.join("project.json"))
    }

    fn token_hash(&self, token: &str) -> String {
        hex::encode(Sha256::digest(token.as_bytes()))
    }

    // ── Issues ───────────────────────────────────────────────

    pub fn list_issues(&self, tenant: &str, project: &str) -> Result<Vec<Issue>> {
        let path = self.issues_path(tenant, project)?;
        if !path.exists() {
            return Ok(Vec::new());
        }
        #[derive(Deserialize)]
        struct IssueStore {
            issues: Vec<Issue>,
        }
        let store: IssueStore = serde_json::from_slice(&fs::read(path)?)?;
        Ok(store.issues)
    }

    pub fn create_issue(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
        title: &str,
        body: &str,
    ) -> Result<Issue> {
        self.ensure_project_storage(tenant, project)?;
        let path = self.issues_path(tenant, project)?;
        #[derive(Serialize, Deserialize)]
        struct IssueStore {
            next_number: u64,
            issues: Vec<Issue>,
        }
        let mut store: IssueStore = if path.exists() {
            serde_json::from_slice(&fs::read(&path)?)?
        } else {
            IssueStore {
                next_number: 1,
                issues: Vec::new(),
            }
        };
        let issue = Issue {
            id: format!("issue-{}", store.next_number),
            number: store.next_number,
            title: title.to_string(),
            body: body.to_string(),
            status: "open".to_string(),
            author: principal.user.clone(),
            created_at: chrono::Utc::now().to_rfc3339(),
            labels: Vec::new(),
        };
        store.issues.push(issue.clone());
        store.next_number += 1;
        self.write_json(&path, &store)?;
        Ok(issue)
    }

    // ── Workspace state ──────────────────────────────────────

    pub fn workspace_states(&self, tenant: &str, project: &str) -> Result<Vec<WorkspaceState>> {
        self.ensure_project_storage(tenant, project)?;
        let heads_dir = self.project_path(tenant, project)?.join("heads");
        if !heads_dir.exists() {
            return Ok(Vec::new());
        }
        let mut states = Vec::new();
        for entry in fs::read_dir(&heads_dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let Some(workspace) = name.strip_suffix(".head") else {
                continue;
            };
            let head = fs::read_to_string(entry.path())?.trim().to_string();
            let state = self.workspace_state_file(tenant, project, workspace)?;
            states.push(WorkspaceState {
                name: workspace.to_string(),
                status: state.status,
                head: (!head.is_empty()).then_some(head),
                parent_workspace: state.parent_workspace,
                is_ready: state.is_ready,
                mergeable: state.mergeable,
            });
        }
        states.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(states)
    }

    pub fn workspace_history(&self, tenant: &str, project: &str, workspace: &str) -> Result<Vec<HistoryEntry>> {
        self.ensure_project_storage(tenant, project)?;
        let path = self.history_path(tenant, project)?;
        if !path.exists() {
            return Ok(Vec::new());
        }
        #[derive(Deserialize)]
        struct HistoryStore {
            entries: Vec<HistoryEntry>,
        }
        let store: HistoryStore = serde_json::from_slice(&fs::read(path)?)?;
        Ok(store
            .entries
            .into_iter()
            .filter(|e| e.workspace == workspace)
            .collect())
    }

    pub fn mark_workspace_ready(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        principal: &TokenPrincipal,
    ) -> Result<()> {
        self.ensure_project_storage(tenant, project)?;
        let mut state = self.workspace_state_file(tenant, project, workspace)?;
        state.status = "ready".to_string();
        state.is_ready = true;
        self.write_workspace_state(tenant, project, workspace, &state)?;
        self.log_history(tenant, project, workspace, principal, "ready", &format!("{} marked workspace {} as ready", principal.user, workspace))?;
        Ok(())
    }

    pub fn merge_workspace(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        principal: &TokenPrincipal,
    ) -> Result<()> {
        self.ensure_project_storage(tenant, project)?;
        let mut state = self.workspace_state_file(tenant, project, workspace)?;
        state.status = "merged".to_string();
        state.is_ready = false;
        state.mergeable = false;
        self.write_workspace_state(tenant, project, workspace, &state)?;
        self.log_history(tenant, project, workspace, principal, "merge", &format!("{} merged workspace {}", principal.user, workspace))?;
        Ok(())
    }

    fn workspace_state_file(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
    ) -> Result<WorkspaceStateFile> {
        let path = self.workspace_state_path(tenant, project, workspace)?;
        if !path.exists() {
            return Ok(WorkspaceStateFile {
                status: "draft".to_string(),
                parent_workspace: None,
                is_ready: false,
                mergeable: true,
            });
        }
        Ok(serde_json::from_slice(&fs::read(path)?)?)
    }

    fn write_workspace_state(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        state: &WorkspaceStateFile,
    ) -> Result<()> {
        let path = self.workspace_state_path(tenant, project, workspace)?;
        self.write_json(&path, state)
    }

    pub fn log_history(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        principal: &TokenPrincipal,
        kind: &str,
        message: &str,
    ) -> Result<()> {
        let path = self.history_path(tenant, project)?;
        #[derive(Serialize, Deserialize)]
        struct HistoryStore {
            entries: Vec<HistoryEntry>,
        }
        let mut store: HistoryStore = if path.exists() {
            serde_json::from_slice(&fs::read(&path)?)?
        } else {
            HistoryStore {
                entries: Vec::new(),
            }
        };
        store.entries.push(HistoryEntry {
            id: format!("{}-{}", workspace, store.entries.len()),
            kind: kind.to_string(),
            message: message.to_string(),
            author: principal.user.clone(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            workspace: workspace.to_string(),
        });
        self.write_json(&path, &store)?;
        Ok(())
    }

    // ── Project settings ─────────────────────────────────────

    pub fn project_settings(&self, tenant: &str, project: &str) -> Result<ProjectSettings> {
        let path = self.settings_path(tenant, project)?;
        if !path.exists() {
            return Ok(ProjectSettings {
                visibility: "private".to_string(),
                starred_count: 0,
                is_starred: false,
                default_workspace: "main".to_string(),
            });
        }
        Ok(serde_json::from_slice(&fs::read(path)?)?)
    }

    pub fn update_project_settings(
        &self,
        tenant: &str,
        project: &str,
        visibility: Option<String>,
        default_workspace: Option<String>,
    ) -> Result<ProjectSettings> {
        self.ensure_project_storage(tenant, project)?;
        let mut settings = self.project_settings(tenant, project)?;
        if let Some(v) = visibility {
            settings.visibility = v;
        }
        if let Some(w) = default_workspace {
            settings.default_workspace = w;
        }
        self.write_json(&self.settings_path(tenant, project)?, &settings)?;
        Ok(settings)
    }

    // ── Stars ────────────────────────────────────────────────

    pub fn star_project(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<(bool, u64)> {
        let path = self.stars_path(tenant, project)?;
        #[derive(Serialize, Deserialize, Default)]
        struct StarStore {
            stars: Vec<String>,
        }
        let mut store: StarStore = if path.exists() {
            serde_json::from_slice(&fs::read(&path)?)?
        } else {
            StarStore::default()
        };
        if !store.stars.contains(&principal.user) {
            store.stars.push(principal.user.clone());
        }
        self.write_json(&path, &store)?;
        Ok((true, store.stars.len() as u64))
    }

    pub fn unstar_project(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<(bool, u64)> {
        let path = self.stars_path(tenant, project)?;
        #[derive(Serialize, Deserialize, Default)]
        struct StarStore {
            stars: Vec<String>,
        }
        let mut store: StarStore = if path.exists() {
            serde_json::from_slice(&fs::read(&path)?)?
        } else {
            StarStore::default()
        };
        store.stars.retain(|u| u != &principal.user);
        self.write_json(&path, &store)?;
        Ok((false, store.stars.len() as u64))
    }

    pub fn is_starred(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<(bool, u64)> {
        let path = self.stars_path(tenant, project)?;
        #[derive(Deserialize)]
        struct StarStore {
            stars: Vec<String>,
        }
        let store: StarStore = if path.exists() {
            serde_json::from_slice(&fs::read(path)?)?
        } else {
            StarStore { stars: Vec::new() }
        };
        Ok((
            store.stars.contains(&principal.user),
            store.stars.len() as u64,
        ))
    }

    // ── Paths ────────────────────────────────────────────────

    fn issues_path(&self, tenant: &str, project: &str) -> Result<PathBuf> {
        Ok(self.project_path(tenant, project)?.join("issues.json"))
    }

    fn history_path(&self, tenant: &str, project: &str) -> Result<PathBuf> {
        Ok(self.project_path(tenant, project)?.join("history.json"))
    }

    fn workspace_state_path(&self, tenant: &str, project: &str, workspace: &str) -> Result<PathBuf> {
        Ok(self
            .project_path(tenant, project)?
            .join("workspaces")
            .join(format!("{}.json", validate_segment_for_path(workspace)?)))
    }

    fn settings_path(&self, tenant: &str, project: &str) -> Result<PathBuf> {
        Ok(self.project_path(tenant, project)?.join("settings.json"))
    }

    fn stars_path(&self, tenant: &str, project: &str) -> Result<PathBuf> {
        Ok(self.project_path(tenant, project)?.join("stars.json"))
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct WorkspaceStateFile {
    status: String,
    parent_workspace: Option<String>,
    is_ready: bool,
    mergeable: bool,
}

fn validate_segment_for_path(value: &str) -> Result<&str> {
    validate_segment(value)?;
    Ok(value)
}
