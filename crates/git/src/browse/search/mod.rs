use crate::state::{AppState, is_object_id, repository_path, safe_segment};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use regex::bytes::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

mod matching;
mod scan;

const MAX_PATTERN_BYTES: usize = 256;
const MAX_FILES: usize = 100;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchRequest {
    owner: String,
    repository: String,
    commit_id: String,
    pattern: String,
    #[serde(default)]
    regex: bool,
    #[serde(default)]
    case_sensitive: bool,
    #[serde(default)]
    paths: Vec<String>,
    #[serde(default)]
    extensions: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchMatch {
    line: usize,
    text: String,
    ranges: Vec<[usize; 2]>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchFile {
    path: String,
    object_id: String,
    match_count: usize,
    matches: Vec<SearchMatch>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResponse {
    files: Vec<SearchFile>,
    truncated: bool,
}

pub(crate) async fn search_repository(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<SearchRequest>,
) -> Response {
    if headers
        .get("x-marl-gateway-token")
        .and_then(|value| value.to_str().ok())
        != Some(state.gateway_token.as_str())
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    if !safe_segment(&request.owner)
        || !safe_segment(&request.repository)
        || !is_object_id(&request.commit_id)
        || request.pattern.is_empty()
        || request.pattern.len() > MAX_PATTERN_BYTES
    {
        return StatusCode::UNPROCESSABLE_ENTITY.into_response();
    }
    let source = if request.regex {
        request.pattern.clone()
    } else {
        regex::escape(&request.pattern)
    };
    let Ok(pattern) = RegexBuilder::new(&source)
        .case_insensitive(!request.case_sensitive)
        .multi_line(true)
        .size_limit(1 << 20)
        .dfa_size_limit(4 << 20)
        .build()
    else {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({"error": "invalid_pattern"})),
        )
            .into_response();
    };
    let Ok(repository) = repository_path(&state.repositories, &request.owner, &request.repository)
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let filter = scan::PathFilter::new(&request.paths, &request.extensions);
    match scan::search(&repository, &request.commit_id, pattern, filter, MAX_FILES).await {
        Ok((files, truncated)) => Json(SearchResponse { files, truncated }).into_response(),
        Err(error) => {
            eprintln!("code search failed: {error:#}");
            StatusCode::BAD_GATEWAY.into_response()
        }
    }
}
