use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectMetadata {
    pub tenant: String,
    pub project: String,
    pub owner: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TenantMetadata {
    pub name: String,
    pub kind: String,
    pub owner: String,
    pub members: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TenantSummary {
    pub name: String,
    pub kind: String,
    pub owner: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectSummary {
    pub tenant: String,
    pub project: String,
    pub owner: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct WorkspaceSummary {
    pub name: String,
    pub head: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectDetailResponse {
    pub project: ProjectSummary,
    pub workspaces: Vec<WorkspaceSummary>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct ProjectStats {
    pub workspace_count: u64,
    pub open_issue_count: u64,
    pub ready_count: u64,
    pub release_count: u64,
    pub history_count: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TreeEntryInfo {
    pub path: String,
    pub name: String,
    pub id: String,
    pub entry_type: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectTreeResponse {
    pub workspace: String,
    pub head: Option<String>,
    pub root_tree: Option<String>,
    pub entries: Vec<TreeEntryInfo>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ObjectFileResponse {
    pub path: String,
    pub id: String,
    pub text: Option<String>,
    pub binary: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProjectDiscoveryItem {
    pub tenant: String,
    pub project: String,
    pub owner: String,
    pub stats: ProjectStats,
    pub last_activity_at: Option<String>,
    pub latest_release: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProjectReleaseFeedItem {
    pub tenant: String,
    pub project: String,
    pub owner: String,
    pub release: serde_json::Value,
    pub released_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HomeResponse {
    pub projects: Vec<ProjectDiscoveryItem>,
    pub following: Vec<ProjectDiscoveryItem>,
    pub releases: Vec<ProjectReleaseFeedItem>,
    pub discover: Vec<ProjectDiscoveryItem>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct WorkspaceState {
    pub name: String,
    pub status: String,
    pub head: Option<String>,
    pub parent_workspace: Option<String>,
    pub child_workspaces: Vec<String>,
    pub is_ready: bool,
    pub mergeable: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct WorkspaceStateResponse {
    pub workspaces: Vec<WorkspaceState>,
}
