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
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FollowResponse {
    pub is_following: bool,
    pub can_follow: bool,
}
