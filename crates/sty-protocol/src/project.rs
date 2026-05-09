use serde::{Deserialize, Serialize};

use crate::{Issue, UserProfile};

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
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

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct CreateProjectRequest {
    #[serde(default)]
    pub folder: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TenantFolder {
    pub tenant: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TenantFoldersResponse {
    pub folders: Vec<TenantFolder>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateTenantFolderRequest {
    pub path: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MoveProjectFolderRequest {
    #[serde(default)]
    pub folder: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ForkProjectRequest {
    pub source_tenant: String,
    pub source_project: String,
    pub target_tenant: String,
    pub target_project: String,
    pub mode: String,
    pub workspace: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ForkProjectResponse {
    pub source: ProjectSummary,
    pub target: ProjectSummary,
    pub mode: String,
    pub workspace: Option<String>,
    pub linked: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SendWorkRequest {
    pub workspace: String,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SendWorkResponse {
    pub source: ProjectSummary,
    pub fork: ProjectSummary,
    pub workspace: String,
    pub title: String,
    pub message: String,
    pub head: String,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    #[serde(default)]
    pub truncated: bool,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
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
pub struct HomeReadyWorkspace {
    pub tenant: String,
    pub project: String,
    pub workspace: String,
    pub head: Option<String>,
    pub parent_workspace: Option<String>,
    pub mergeable: bool,
    pub marked_at: Option<String>,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_profile: Option<UserProfile>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HomeIssueItem {
    pub tenant: String,
    pub project: String,
    pub issue: Issue,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HomeMentionItem {
    pub tenant: String,
    pub project: String,
    pub issue_id: String,
    pub issue_number: u64,
    pub issue_title: String,
    pub source: String,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_profile: Option<UserProfile>,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HomeActivityItem {
    pub tenant: String,
    pub project: String,
    pub kind: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub href: String,
    pub timestamp: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_profile: Option<UserProfile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProfileContributionDay {
    pub date: String,
    pub count: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProfileTenant {
    pub name: String,
    pub kind: String,
    pub public_project_count: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProfileStats {
    pub public_project_count: u64,
    pub contribution_count: u64,
    pub tenant_count: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UserProfilePage {
    pub tenant: String,
    pub owner: String,
    pub profile: UserProfile,
    pub is_self: bool,
    pub stats: ProfileStats,
    pub projects: Vec<ProjectDiscoveryItem>,
    pub pinned_projects: Vec<ProjectDiscoveryItem>,
    pub pin_candidates: Vec<ProjectDiscoveryItem>,
    pub following: Vec<ProjectDiscoveryItem>,
    pub tenants: Vec<ProfileTenant>,
    pub contributions: Vec<ProfileContributionDay>,
    pub activity: Vec<HomeActivityItem>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateProfilePinsRequest {
    pub projects: Vec<ProjectPinRequest>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProjectPinRequest {
    pub tenant: String,
    pub project: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct HomeAttention {
    pub ready_workspaces: Vec<HomeReadyWorkspace>,
    pub assigned_issues: Vec<HomeIssueItem>,
    pub mentions: Vec<HomeMentionItem>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HomeResponse {
    pub projects: Vec<ProjectDiscoveryItem>,
    pub following: Vec<ProjectDiscoveryItem>,
    pub releases: Vec<ProjectReleaseFeedItem>,
    pub discover: Vec<ProjectDiscoveryItem>,
    pub attention: HomeAttention,
    pub activity: Vec<HomeActivityItem>,
    pub project_activity: Vec<HomeActivityItem>,
    pub followed_activity: Vec<HomeActivityItem>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct WorkspaceState {
    pub name: String,
    pub status: String,
    pub head: Option<String>,
    pub parent_workspace: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_activity_at: Option<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub reviewers: Vec<String>,
    #[serde(default)]
    pub assignees: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub milestone: Option<String>,
    #[serde(default)]
    pub linked_issues: Vec<String>,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub changed_file_count: u64,
    #[serde(default)]
    pub additions: u64,
    #[serde(default)]
    pub deletions: u64,
    pub child_workspaces: Vec<String>,
    pub is_ready: bool,
    pub mergeable: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct WorkspaceStateResponse {
    pub workspaces: Vec<WorkspaceState>,
}
