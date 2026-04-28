use serde::{Deserialize, Serialize};

pub const DEFAULT_AVE_CLIENT_ID: &str = "app_813ac5533bb87d939f328d76b5a1dca8";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CapabilitiesResponse {
    pub version: String,
    pub capabilities: Vec<String>,
}

pub fn protocol_capabilities() -> CapabilitiesResponse {
    CapabilitiesResponse {
        version: "1.0".to_string(),
        capabilities: [
            "issues",
            "milestones",
            "labels",
            "ready",
            "comments",
            "reactions",
            "hooks",
            "webhooks",
            "search",
            "stars",
            "releases",
            "signed_snapshots",
            "audit_log",
            "profiles",
            "ssh_keys",
        ]
        .into_iter()
        .map(ToOwned::to_owned)
        .collect(),
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Paginated<T> {
    pub items: Vec<T>,
    pub page: usize,
    pub per_page: usize,
    pub total: usize,
    pub total_pages: usize,
    pub next: Option<usize>,
    pub prev: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CompareRequest {
    pub local_head: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CompareResponse {
    pub remote_head: Option<String>,
    pub relation: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MissingRequest {
    pub ids: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct MissingResponse {
    pub missing: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UploadRequest {
    pub objects: Vec<RemoteObject>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct DownloadRequest {
    pub ids: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DownloadResponse {
    pub objects: Vec<RemoteObject>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct RemoteObject {
    pub id: String,
    pub kind: String,
    pub bytes_base64: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ChunkCompleteRequest {
    pub kind: String,
    pub total_size: usize,
    pub chunk_count: usize,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct HeadUpdateRequest {
    pub expected_head: Option<String>,
    pub new_head: String,
}

#[derive(Debug, Serialize)]
pub struct OkResponse {
    pub ok: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AuthCheckResponse {
    pub ok: bool,
    pub user: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<UserProfile>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct HeadResponse {
    pub head: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SnapshotObject {
    pub parents: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TokenEntry {
    pub token_hash: String,
    pub user: String,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct TokenFile {
    pub tokens: Vec<TokenEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TokenPrincipal {
    pub user: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UserProfile {
    pub user: String,
    pub display_name: String,
    pub handle: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
    pub updated_at: Option<String>,
}

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
pub struct MeResponse {
    pub user: String,
    pub profile: Option<UserProfile>,
    pub tenants: Vec<TenantSummary>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateOrgRequest {
    pub name: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StyConfig {
    pub remote_url: String,
    pub token: String,
    pub user: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TokenResponse {
    pub token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SessionExchangeRequest {
    pub id_token: String,
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
pub struct Issue {
    pub id: String,
    pub number: u64,
    pub title: String,
    pub body: String,
    pub state: String,
    pub status: String,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_profile: Option<UserProfile>,
    pub assignees: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub labels: Vec<String>,
    pub milestone: Option<String>,
    pub workspace: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateIssueRequest {
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub assignee: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateIssueRequest {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Comment {
    pub id: String,
    pub issue_id: String,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_profile: Option<UserProfile>,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateCommentRequest {
    pub body: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CommentsResponse {
    pub comments: Vec<Comment>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct IssuesResponse {
    pub issues: Vec<Issue>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectsResponse {
    pub projects: Vec<ProjectSummary>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct HistoryEntry {
    pub id: String,
    pub kind: String,
    pub message: String,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_profile: Option<UserProfile>,
    pub timestamp: String,
    pub workspace: String,
    pub snapshot_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct HistoryResponse {
    pub entries: Vec<HistoryEntry>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LogHistoryRequest {
    pub kind: String,
    pub message: String,
    pub workspace: String,
    pub snapshot_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ChangedFile {
    pub path: String,
    pub change_type: String,
    pub old_id: Option<String>,
    pub new_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MergePreviewResponse {
    pub files: Vec<ChangedFile>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct HistoryEntryDetail {
    pub id: String,
    pub kind: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
    pub workspace: String,
    pub snapshot_id: Option<String>,
    pub parent_id: Option<String>,
    pub files: Vec<ChangedFile>,
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

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct NavbarItem {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub item_type: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub order: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PanelItem {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub panel_type: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub button_label: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub order: u32,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectSettings {
    pub visibility: String,
    pub starred_count: u64,
    pub is_starred: bool,
    pub default_workspace: String,
    #[serde(default)]
    pub navbar_items: Vec<NavbarItem>,
    #[serde(default)]
    pub panels: Vec<PanelItem>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateSettingsRequest {
    pub visibility: Option<String>,
    pub default_workspace: Option<String>,
    pub navbar_items: Option<Vec<NavbarItem>>,
    pub panels: Option<Vec<PanelItem>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StarResponse {
    pub is_starred: bool,
    pub starred_count: u64,
}

pub fn validate_target(target: &str) -> anyhow::Result<(&str, &str)> {
    let Some((tenant, project)) = target.split_once('/') else {
        anyhow::bail!("project must be in tenant/project form");
    };
    validate_segment(tenant)?;
    validate_segment(project)?;
    Ok((tenant, project))
}

pub fn validate_segment(value: &str) -> anyhow::Result<()> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        anyhow::bail!("invalid name segment `{value}`");
    }
    Ok(())
}

pub fn is_hex_id(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|ch| ch.is_ascii_hexdigit())
}
