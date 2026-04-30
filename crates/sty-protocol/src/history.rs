use serde::{Deserialize, Serialize};

use crate::UserProfile;

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<HistorySignature>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct HistoryResponse {
    pub entries: Vec<HistoryEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HistorySignature {
    pub user: String,
    pub key_id: String,
    pub algorithm: String,
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
