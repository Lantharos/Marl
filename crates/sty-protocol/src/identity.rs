use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UserProfile {
    pub user: String,
    pub display_name: String,
    pub handle: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Collaborator {
    pub user: String,
    pub role: String,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<UserProfile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub added_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub added_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    pub direct: bool,
    pub removable: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CollaboratorRequest {
    pub user: String,
    pub role: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CollaboratorUpdateRequest {
    pub role: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AccessResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default)]
    pub archived: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_by_profile: Option<UserProfile>,
    pub can_read: bool,
    pub can_write: bool,
    pub can_maintain: bool,
    pub can_admin: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AuthCheckResponse {
    pub ok: bool,
    pub user: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<UserProfile>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct MeResponse {
    pub user: String,
    pub profile: Option<UserProfile>,
    pub tenants: Vec<crate::TenantSummary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_tenant: Option<String>,
    #[serde(default)]
    pub account_setup_required: bool,
    #[serde(default)]
    pub account_tenant_suggestions: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateOrgRequest {
    pub name: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateAccountTenantRequest {
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
    #[serde(default)]
    pub client: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RemoteApprovalRequest {
    pub action: String,
    pub summary: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RemoteApprovalResponse {
    pub id: String,
    pub action: String,
    pub summary: String,
    pub status: String,
    pub verify_url: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RemoteApprovalStatus {
    pub id: String,
    pub action: String,
    pub summary: String,
    pub status: String,
    pub expires_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}
