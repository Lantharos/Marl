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
            "comments",
            "reactions",
            "hooks",
            "webhooks",
            "search",
            "follows",
            "releases",
            "signed_snapshots",
            "profiles",
            "ssh_keys",
            "remote_approvals",
            "permissions",
            "collaborators",
            "project_archive",
        ]
        .into_iter()
        .map(ToOwned::to_owned)
        .collect(),
        frontend_url: None,
    }
}
