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
