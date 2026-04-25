use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Result, bail};
use serde::Deserialize;
use sty_protocol::{
    ObjectFileResponse, ProjectTreeResponse, TreeEntryInfo, validate_segment,
};

#[derive(Deserialize)]
struct SnapshotView {
    root_tree: String,
}

#[derive(Deserialize)]
struct TreeObjectView {
    entries: Vec<TreeEntryView>,
}

#[derive(Deserialize)]
struct TreeEntryView {
    name: String,
    id: String,
    entry_type: String,
}

pub struct Catalog {
    root: PathBuf,
}

impl Catalog {
    pub fn new(root: &Path) -> Self {
        Self {
            root: root.to_path_buf(),
        }
    }

    pub fn tree(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        head: Option<String>,
    ) -> Result<ProjectTreeResponse> {
        let Some(head_id) = head.clone() else {
            return Ok(ProjectTreeResponse {
                workspace: workspace.to_string(),
                head,
                root_tree: None,
                entries: Vec::new(),
            });
        };
        let snapshot: SnapshotView =
            serde_json::from_slice(&fs::read(self.object_path(tenant, project, &head_id)?)?)?;
        let mut entries = Vec::new();
        self.walk_tree(tenant, project, "", &snapshot.root_tree, &mut entries)?;
        Ok(ProjectTreeResponse {
            workspace: workspace.to_string(),
            head,
            root_tree: Some(snapshot.root_tree),
            entries,
        })
    }

    pub fn file(
        &self,
        tenant: &str,
        project: &str,
        path: &str,
        head: Option<String>,
    ) -> Result<ObjectFileResponse> {
        let tree = self.tree(tenant, project, "", head)?;
        let Some(entry) = tree.entries.iter().find(|entry| entry.path == path) else {
            bail!("file not found");
        };
        if entry.entry_type != "blob" {
            bail!("path is not a file");
        }
        let bytes = fs::read(self.object_path(tenant, project, &entry.id)?)?;
        let text = String::from_utf8(bytes).ok();
        Ok(ObjectFileResponse {
            path: path.to_string(),
            id: entry.id.clone(),
            binary: text.is_none(),
            text,
        })
    }

    fn walk_tree(
        &self,
        tenant: &str,
        project: &str,
        prefix: &str,
        tree_id: &str,
        output: &mut Vec<TreeEntryInfo>,
    ) -> Result<()> {
        let tree: TreeObjectView =
            serde_json::from_slice(&fs::read(self.object_path(tenant, project, tree_id)?)?)?;
        for entry in tree.entries {
            let path = if prefix.is_empty() {
                entry.name.clone()
            } else {
                format!("{prefix}/{}", entry.name)
            };
            output.push(TreeEntryInfo {
                path: path.clone(),
                name: entry.name,
                id: entry.id.clone(),
                entry_type: entry.entry_type.clone(),
            });
            if entry.entry_type == "tree" {
                self.walk_tree(tenant, project, &path, &entry.id, output)?;
            }
        }
        Ok(())
    }

    fn object_path(&self, tenant: &str, project: &str, id: &str) -> Result<PathBuf> {
        Ok(self.project_path(tenant, project)?.join("objects").join(id))
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
}
