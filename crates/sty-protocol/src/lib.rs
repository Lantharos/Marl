use serde::{Deserialize, Serialize};

pub const DEFAULT_AVE_CLIENT_ID: &str = "app_813ac5533bb87d939f328d76b5a1dca8";

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
}

#[derive(Debug, Serialize)]
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

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectMetadata {
    pub tenant: String,
    pub project: String,
    pub owner: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StyConfig {
    pub remote_url: String,
    pub token: String,
    pub user: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DevTokenRequest {
    pub user: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TokenResponse {
    pub token: String,
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
pub struct ProjectsResponse {
    pub projects: Vec<ProjectSummary>,
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
