use serde::{Deserialize, Serialize};

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_workspace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_head: Option<String>,
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

#[derive(Debug, Deserialize, Serialize)]
pub struct DownloadResponse {
    pub objects: Vec<RemoteObject>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct RemoteObject {
    pub id: String,
    pub kind: String,
    pub bytes_base64: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PathClosureRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<String>,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PathClosureObject {
    pub id: String,
    pub kind: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PathClosureFile {
    pub path: String,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PathClosureResponse {
    pub workspace: String,
    pub head: String,
    pub root_tree: String,
    pub path: String,
    pub objects: Vec<PathClosureObject>,
    pub files: Vec<PathClosureFile>,
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
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub objects_verified: bool,
}

#[derive(Debug, Serialize)]
pub struct OkResponse {
    pub ok: bool,
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
