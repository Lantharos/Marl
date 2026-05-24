use serde::{Deserialize, Serialize};

pub const DEFAULT_AVE_CLIENT_ID: &str = "app_813ac5533bb87d939f328d76b5a1dca8";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CapabilitiesResponse {
    pub version: String,
    pub capabilities: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frontend_url: Option<String>,
}

pub fn protocol_capabilities() -> CapabilitiesResponse {
    CapabilitiesResponse {
        version: "1.0".to_string(),
        capabilities: [
            "issues",
            "milestones",
            "labels",
            "ready",
            "merge_rules",
            "status_checks",
            "comments",
            "reactions",
            "hooks",
            "webhooks",
            "api_keys",
            "granular_api_keys",
            "developer_apps",
            "oauth_apps",
            "search",
            "follows",
            "releases",
            "public_releases",
            "leaves",
            "signed_snapshots",
            "profiles",
            "ssh_keys",
            "remote_approvals",
            "audit_log",
            "notifications",
            "permissions",
            "collaborators",
            "project_archive",
            "forks",
            "sendwork",
            "object_batch_download",
            "object_path_closure",
        ]
        .into_iter()
        .map(ToOwned::to_owned)
        .collect(),
        frontend_url: None,
    }
}
