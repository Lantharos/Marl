use serde::{Deserialize, Serialize};

use crate::UserProfile;

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

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProjectComponent {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub owners: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub framework: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub build_command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub test_command: Option<String>,
    #[serde(default)]
    pub deploy_targets: Vec<String>,
    #[serde(default)]
    pub issue_labels: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_policy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_policy: Option<String>,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(default)]
    pub require_owner_approval: bool,
    #[serde(default)]
    pub order: u32,
}

fn default_true() -> bool {
    true
}

fn default_accent_color() -> String {
    "#d9a66c".to_string()
}

fn default_background_color() -> String {
    "#0f0f0d".to_string()
}

fn default_surface_color() -> String {
    "#141412".to_string()
}

fn default_foreground_color() -> String {
    "#eae9e4".to_string()
}

fn default_muted_color() -> String {
    "#8c887e".to_string()
}

fn default_border_color() -> String {
    "#2a2a28".to_string()
}

fn default_primary_color() -> String {
    "#eae9e4".to_string()
}

fn default_primary_foreground_color() -> String {
    "#0f0f0d".to_string()
}

fn default_code_background_color() -> String {
    "#0b0b0a".to_string()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProjectAppearance {
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default = "default_background_color")]
    pub background_color: String,
    #[serde(default = "default_surface_color")]
    pub surface_color: String,
    #[serde(default = "default_foreground_color")]
    pub foreground_color: String,
    #[serde(default = "default_muted_color")]
    pub muted_color: String,
    #[serde(default = "default_border_color")]
    pub border_color: String,
    #[serde(default = "default_background_color")]
    pub nav_background_color: String,
    #[serde(default = "default_foreground_color")]
    pub nav_foreground_color: String,
    #[serde(default = "default_muted_color")]
    pub nav_muted_color: String,
    #[serde(default = "default_primary_color")]
    pub primary_color: String,
    #[serde(default = "default_primary_foreground_color")]
    pub primary_foreground_color: String,
    #[serde(default = "default_code_background_color")]
    pub code_background_color: String,
}

impl Default for ProjectAppearance {
    fn default() -> Self {
        Self {
            accent_color: default_accent_color(),
            background_color: default_background_color(),
            surface_color: default_surface_color(),
            foreground_color: default_foreground_color(),
            muted_color: default_muted_color(),
            border_color: default_border_color(),
            nav_background_color: default_background_color(),
            nav_foreground_color: default_foreground_color(),
            nav_muted_color: default_muted_color(),
            primary_color: default_primary_color(),
            primary_foreground_color: default_primary_foreground_color(),
            code_background_color: default_code_background_color(),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectSettings {
    pub visibility: String,
    #[serde(default)]
    pub follower_count: u64,
    #[serde(default)]
    pub is_following: bool,
    #[serde(default)]
    pub public_releases: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_profile: Option<UserProfile>,
    pub default_workspace: String,
    #[serde(default)]
    pub appearance: ProjectAppearance,
    #[serde(default)]
    pub navbar_items: Vec<NavbarItem>,
    #[serde(default)]
    pub panels: Vec<PanelItem>,
    #[serde(default)]
    pub merge_rules: MergeRules,
    #[serde(default)]
    pub protected_workspaces: Vec<String>,
    #[serde(default)]
    pub path_visibility: Vec<PathVisibilityRule>,
    #[serde(default)]
    pub components: Vec<ProjectComponent>,
    #[serde(default)]
    pub ci: ProjectCiSettings,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateSettingsRequest {
    pub visibility: Option<String>,
    pub public_releases: Option<bool>,
    pub archived: Option<bool>,
    pub default_workspace: Option<String>,
    pub appearance: Option<ProjectAppearance>,
    pub navbar_items: Option<Vec<NavbarItem>>,
    pub panels: Option<Vec<PanelItem>>,
    pub merge_rules: Option<MergeRules>,
    pub protected_workspaces: Option<Vec<String>>,
    pub path_visibility: Option<Vec<PathVisibilityRule>>,
    pub components: Option<Vec<ProjectComponent>>,
    pub ci: Option<ProjectCiSettings>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PathVisibilityRule {
    pub path: String,
    pub visibility: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MergeRules {
    #[serde(default)]
    pub required_approvals: u8,
    #[serde(default)]
    pub require_passing_checks: bool,
    #[serde(default = "default_dismiss_stale_approvals")]
    pub dismiss_stale_approvals: bool,
    #[serde(default = "default_block_unresolved_comments")]
    pub block_unresolved_comments: bool,
}

impl Default for MergeRules {
    fn default() -> Self {
        Self {
            required_approvals: 0,
            require_passing_checks: false,
            dismiss_stale_approvals: true,
            block_unresolved_comments: true,
        }
    }
}

fn default_dismiss_stale_approvals() -> bool {
    true
}

fn default_block_unresolved_comments() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProjectCiSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub commands: Vec<CiCommand>,
    #[serde(default)]
    pub blocks: Vec<CiCommandBlock>,
    #[serde(default = "default_ci_max_concurrent_jobs")]
    pub max_concurrent_jobs: u32,
    #[serde(default = "default_ci_max_jobs_per_head")]
    pub max_jobs_per_head: u32,
    #[serde(default = "default_ci_max_attempts")]
    pub max_attempts: u32,
    #[serde(default = "default_ci_lease_grace_seconds")]
    pub lease_grace_seconds: u32,
    #[serde(default = "default_ci_artifact_retention_days")]
    pub artifact_retention_days: u32,
    #[serde(default = "default_ci_cache_retention_days")]
    pub cache_retention_days: u32,
}

impl Default for ProjectCiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            commands: Vec::new(),
            blocks: Vec::new(),
            max_concurrent_jobs: default_ci_max_concurrent_jobs(),
            max_jobs_per_head: default_ci_max_jobs_per_head(),
            max_attempts: default_ci_max_attempts(),
            lease_grace_seconds: default_ci_lease_grace_seconds(),
            artifact_retention_days: default_ci_artifact_retention_days(),
            cache_retention_days: default_ci_cache_retention_days(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CiCommand {
    pub name: String,
    pub run: String,
    #[serde(default)]
    pub uses_blocks: Vec<String>,
    #[serde(default = "default_ci_timeout_seconds")]
    pub timeout_seconds: u32,
    #[serde(default = "default_ci_events")]
    pub events: Vec<String>,
    #[serde(default)]
    pub workspaces: Vec<String>,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub components: Vec<String>,
    #[serde(default)]
    pub matrix: Vec<CiMatrixEntry>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub env: Vec<CiEnvEntry>,
    #[serde(default)]
    pub secrets: Vec<String>,
    #[serde(default)]
    pub artifacts: Vec<String>,
    #[serde(default)]
    pub cache: Vec<CiCacheEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CiCommandBlock {
    pub name: String,
    pub run: String,
    #[serde(default)]
    pub env: Vec<CiEnvEntry>,
    #[serde(default)]
    pub secrets: Vec<String>,
    #[serde(default)]
    pub cache: Vec<CiCacheEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CiEnvEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CiMatrixEntry {
    pub key: String,
    #[serde(default)]
    pub values: Vec<String>,
}

fn default_ci_timeout_seconds() -> u32 {
    900
}

fn default_ci_events() -> Vec<String> {
    vec!["workspace.ready".to_string()]
}

fn default_ci_max_concurrent_jobs() -> u32 {
    8
}

fn default_ci_max_jobs_per_head() -> u32 {
    50
}

fn default_ci_max_attempts() -> u32 {
    3
}

fn default_ci_lease_grace_seconds() -> u32 {
    120
}

fn default_ci_artifact_retention_days() -> u32 {
    30
}

fn default_ci_cache_retention_days() -> u32 {
    30
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CiCacheEntry {
    pub key: String,
    pub path: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FollowResponse {
    pub is_following: bool,
    pub can_follow: bool,
}
