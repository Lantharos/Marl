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

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectSettings {
    pub visibility: String,
    #[serde(default)]
    pub follower_count: u64,
    #[serde(default)]
    pub is_following: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_profile: Option<UserProfile>,
    pub default_workspace: String,
    #[serde(default)]
    pub navbar_items: Vec<NavbarItem>,
    #[serde(default)]
    pub panels: Vec<PanelItem>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateSettingsRequest {
    pub visibility: Option<String>,
    pub archived: Option<bool>,
    pub default_workspace: Option<String>,
    pub navbar_items: Option<Vec<NavbarItem>>,
    pub panels: Option<Vec<PanelItem>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FollowResponse {
    pub is_following: bool,
    pub can_follow: bool,
}
