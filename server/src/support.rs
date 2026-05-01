use serde_json::json;
use sty_protocol::validate_segment;
use worker::*;

use crate::request_context::{AppRouteContext, D1_BOOKMARK_HEADER, Database};

pub const MAX_TREE_DEPTH: usize = 128;
pub const MAX_TREE_ENTRIES: usize = 200_000;

pub fn bucket(env: &Env) -> Result<Bucket> {
    env.bucket("STY_OBJECTS")
}

pub fn db(ctx: &AppRouteContext) -> Result<&Database> {
    Ok(ctx.data.database())
}

pub fn project_params(ctx: &AppRouteContext) -> Result<(String, String)> {
    let tenant = param(ctx, "tenant")?;
    let project = param(ctx, "project")?;
    validate_segment(&tenant).map_err(|e| Error::RustError(e.to_string()))?;
    validate_segment(&project).map_err(|e| Error::RustError(e.to_string()))?;
    Ok((tenant, project))
}

pub fn param(ctx: &AppRouteContext, name: &str) -> Result<String> {
    ctx.param(name)
        .map(ToOwned::to_owned)
        .ok_or_else(|| Error::RustError(format!("missing route param {name}")))
}

pub fn object_key(tenant: &str, project: &str, id: &str) -> String {
    format!("projects/{tenant}/{project}/objects/{id}")
}

pub fn validate_object_metadata(id: &str, kind: &str) -> Result<()> {
    if !matches!(kind, "blob" | "tree" | "snapshot") {
        return Err(Error::RustError("unknown object kind".to_string()));
    }
    validate_object_id(id)?;
    Ok(())
}

pub fn validate_object_id(id: &str) -> Result<()> {
    if id.len() == 64 && id.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Ok(());
    }
    Err(Error::RustError("invalid object id".to_string()))
}

pub fn validate_tree_entry_name(name: &str) -> Result<()> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains(':')
        || name.contains('\0')
        || name.chars().any(char::is_control)
    {
        return Err(Error::RustError("unsafe tree entry name".to_string()));
    }
    Ok(())
}

pub fn validate_object_payload(kind: &str, bytes: &[u8]) -> Result<()> {
    match kind {
        "blob" => Ok(()),
        "tree" => validate_tree_payload(bytes),
        "snapshot" => validate_snapshot_payload(bytes),
        _ => Err(Error::RustError("unknown object kind".to_string())),
    }
}

pub fn required_header(req: &Request, name: &str) -> Result<String> {
    req.headers()
        .get(name)?
        .ok_or_else(|| Error::RustError(format!("missing {name} header")))
}

pub fn bearer_token(req: &Request) -> Result<String> {
    let Some(value) = req.headers().get("authorization")? else {
        return Err(Error::RustError("missing bearer token".to_string()));
    };
    value
        .strip_prefix("Bearer ")
        .map(ToOwned::to_owned)
        .ok_or_else(|| Error::RustError("missing bearer token".to_string()))
}

pub fn required_usize_header(req: &Request, name: &str) -> Result<usize> {
    required_header(req, name)?
        .parse()
        .map_err(|_| Error::RustError(format!("invalid {name} header")))
}

pub async fn put_bytes(bucket: &Bucket, key: &str, value: Vec<u8>) -> Result<()> {
    bucket.put(key, value).execute().await?;
    Ok(())
}

pub async fn delete_prefix(bucket: &Bucket, prefix: &str) -> Result<()> {
    let mut cursor = None;
    loop {
        let mut list = bucket.list().prefix(prefix).limit(1000);
        if let Some(value) = cursor.take() {
            list = list.cursor(value);
        }
        let objects = list.execute().await?;
        let keys: Vec<String> = objects
            .objects()
            .into_iter()
            .map(|object| object.key())
            .collect();
        if !keys.is_empty() {
            bucket.delete_multiple(keys).await?;
        }
        if !objects.truncated() {
            return Ok(());
        }
        let Some(next_cursor) = objects.cursor() else {
            return Ok(());
        };
        cursor = Some(next_cursor);
    }
}

pub fn json_error(status: u16, message: &str) -> Result<Response> {
    with_cors(Response::from_json(&json!({ "error": message }))?.with_status(status))
}

pub fn response_for_error(error: Error) -> Result<Response> {
    let message = error.to_string();
    let status = status_for_error(&message);
    json_error(status, public_error_message(status, &message))
}

pub fn object_size_limit(env: &Env) -> usize {
    env.var("STY_MAX_OBJECT_BYTES")
        .ok()
        .and_then(|value| value.to_string().parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(64 * 1024 * 1024)
}

pub fn frontend_origin(req: &Request, env: &Env) -> String {
    if let Ok(origin) = env
        .var("STY_FRONTEND_ORIGIN")
        .or_else(|_| env.var("STY_WEB_ORIGIN"))
    {
        return origin.to_string();
    }
    req.url()
        .ok()
        .and_then(|url| {
            let port = url
                .port()
                .map(|port| format!(":{port}"))
                .unwrap_or_default();
            Some(format!("{}://{}{}", url.scheme(), url.host_str()?, port))
        })
        .unwrap_or_else(|| "http://127.0.0.1:8787".to_string())
}

fn status_for_error(message: &str) -> u16 {
    let lower = message.to_ascii_lowercase();
    if lower.contains("missing bearer token")
        || lower.contains("invalid bearer token")
        || lower.contains("sign in required")
    {
        return 401;
    }
    if lower.contains("access denied")
        || lower.contains("forbidden")
        || lower.contains("control denied")
        || lower.contains("browser approval required")
        || lower.contains("archived")
    {
        return 403;
    }
    if lower.contains("not found")
        || lower.contains("missing object")
        || lower.contains("does not exist")
    {
        return 404;
    }
    if lower.contains("invalid")
        || lower.contains("missing route param")
        || lower.contains("missing field")
        || lower.contains("missing x-")
        || lower.contains("account handle")
        || lower.contains("malformed")
        || lower.contains("unsafe tree")
        || lower.contains("unknown object kind")
    {
        return 400;
    }
    if lower.contains("changed") || lower.contains("conflict") {
        return 409;
    }
    500
}

fn public_error_message(status: u16, message: &str) -> &str {
    if status == 500 {
        "internal server error"
    } else {
        message
    }
}

pub fn preflight_response(req: &Request, env: &Env) -> Result<Response> {
    let mut response = Response::empty()?.with_status(204);
    apply_cors(req, env, &mut response)?;
    Ok(response)
}

pub fn with_cors(mut response: Response) -> Result<Response> {
    set_cors_headers(response.headers_mut())?;
    Ok(response)
}

pub fn not_modified_response(
    req: &Request,
    etag: &str,
    public_cache: bool,
    seconds: u32,
    immutable: bool,
) -> Result<Option<Response>> {
    let normalized = normalize_etag(etag);
    let Some(value) = req.headers().get("if-none-match")? else {
        return Ok(None);
    };
    let matches = value
        .split(',')
        .map(str::trim)
        .any(|candidate| candidate == normalized || candidate.trim_matches('"') == etag);
    if !matches {
        return Ok(None);
    }
    let mut response = Response::empty()?.with_status(304);
    apply_cache_headers(
        response.headers_mut(),
        etag,
        public_cache,
        seconds,
        immutable,
    )?;
    Ok(Some(response))
}

pub fn apply_cache_headers(
    headers: &mut Headers,
    etag: &str,
    public_cache: bool,
    seconds: u32,
    immutable: bool,
) -> Result<()> {
    let mut value = if public_cache {
        format!("public, max-age={seconds}, s-maxage={seconds}")
    } else {
        format!("private, max-age={seconds}")
    };
    if immutable {
        value.push_str(", immutable");
    } else if public_cache {
        value.push_str(", stale-while-revalidate=30");
    }
    headers.set("cache-control", &value)?;
    headers.set("etag", &normalize_etag(etag))?;
    Ok(())
}

pub fn apply_cors(req: &Request, env: &Env, response: &mut Response) -> Result<()> {
    let origin = req.headers().get("origin")?;
    if allowed_origin(env, origin.as_deref()) {
        let headers = response.headers_mut();
        headers.set("access-control-allow-origin", origin.unwrap().as_str())?;
        headers.set("vary", "Origin")?;
        set_cors_headers(headers)?;
    }
    Ok(())
}

fn set_cors_headers(headers: &mut Headers) -> Result<()> {
    headers.set(
        "access-control-allow-methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    )?;
    headers.set(
        "access-control-allow-headers",
        &format!("authorization,content-type,{D1_BOOKMARK_HEADER},x-pig-object-kind,x-pig-object-size,x-pig-chunk-count,x-pig-total-size"),
    )?;
    headers.set(
        "access-control-expose-headers",
        &format!("etag,{D1_BOOKMARK_HEADER},x-pig-object-kind,x-pig-object-size"),
    )?;
    headers.set("access-control-max-age", "86400")?;
    Ok(())
}

fn normalize_etag(etag: &str) -> String {
    if etag.starts_with('"') && etag.ends_with('"') {
        etag.to_string()
    } else {
        format!("\"{etag}\"")
    }
}

fn allowed_origin(env: &Env, origin: Option<&str>) -> bool {
    let Some(origin) = origin else {
        return false;
    };
    if matches!(
        origin,
        "http://localhost:5173"
            | "http://127.0.0.1:5173"
            | "http://localhost:4173"
            | "http://127.0.0.1:4173"
    ) {
        return true;
    }
    env.var("STY_ALLOWED_ORIGINS")
        .map(|value| {
            value
                .to_string()
                .split(',')
                .map(str::trim)
                .any(|allowed| allowed == origin)
        })
        .unwrap_or(false)
}

pub async fn r2_bytes(store: &Bucket, key: &str) -> Result<Vec<u8>> {
    let Some(object) = store.get(key).execute().await? else {
        return Err(Error::RustError(format!("missing object {key}")));
    };
    let Some(body) = object.body() else {
        return Err(Error::RustError(format!("missing object body {key}")));
    };
    body.bytes().await
}

pub(crate) fn paginate_vec<T: serde::Serialize>(
    url: Url,
    items: Vec<T>,
) -> sty_protocol::Paginated<T> {
    let all = url
        .query_pairs()
        .any(|(key, value)| key == "all" && value == "true");
    if all {
        return sty_protocol::Paginated {
            total: items.len(),
            total_pages: 1,
            next: None,
            prev: None,
            page: 1,
            per_page: items.len().max(1),
            items,
        };
    }
    let page = query_usize(&url, "page").unwrap_or(1).max(1);
    let per_page = query_usize(&url, "per_page").unwrap_or(25).clamp(1, 100);
    let total = items.len();
    let total_pages = total.div_ceil(per_page).max(1);
    let start = (page - 1).saturating_mul(per_page);
    let page_items = items
        .into_iter()
        .skip(start)
        .take(per_page)
        .collect::<Vec<_>>();
    sty_protocol::Paginated {
        items: page_items,
        page,
        per_page,
        total,
        total_pages,
        next: (page < total_pages).then_some(page + 1),
        prev: (page > 1).then_some(page - 1),
    }
}

fn query_usize(url: &Url, key: &str) -> Option<usize> {
    url.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.parse().ok()).flatten())
}

pub(crate) fn query_limit(req: &Request, default: usize, max: usize) -> Result<usize> {
    let url = req.url()?;
    Ok(query_usize(&url, "limit").unwrap_or(default).clamp(1, max))
}

#[derive(serde::Deserialize)]
struct TreePayload {
    entries: Vec<TreePayloadEntry>,
}

#[derive(serde::Deserialize)]
struct TreePayloadEntry {
    name: String,
    id: String,
    entry_type: String,
}

#[derive(serde::Deserialize)]
struct SnapshotPayload {
    parents: Vec<String>,
    root_tree: String,
}

fn validate_tree_payload(bytes: &[u8]) -> Result<()> {
    let tree: TreePayload =
        serde_json::from_slice(bytes).map_err(|error| Error::RustError(error.to_string()))?;
    if tree.entries.len() > MAX_TREE_ENTRIES {
        return Err(Error::RustError("tree has too many entries".to_string()));
    }
    for entry in tree.entries {
        validate_tree_entry_name(&entry.name)?;
        validate_object_id(&entry.id)?;
        if !matches!(entry.entry_type.as_str(), "blob" | "tree") {
            return Err(Error::RustError("unknown tree entry type".to_string()));
        }
    }
    Ok(())
}

fn validate_snapshot_payload(bytes: &[u8]) -> Result<()> {
    let snapshot: SnapshotPayload =
        serde_json::from_slice(bytes).map_err(|error| Error::RustError(error.to_string()))?;
    validate_object_id(&snapshot.root_tree)?;
    for parent in snapshot.parents {
        validate_object_id(&parent)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_object_metadata() {
        let id = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert!(validate_object_metadata(id, "blob").is_ok());
        assert!(validate_object_metadata(id, "tree").is_ok());
        assert!(validate_object_metadata(id, "snapshot").is_ok());
        assert!(validate_object_metadata(id, "commit").is_err());
        assert!(validate_object_metadata("abc", "blob").is_err());
    }

    #[test]
    fn rejects_unsafe_tree_names() {
        for name in [
            "",
            ".",
            "..",
            "../secret",
            "dir/file",
            r"dir\file",
            "C:secret",
        ] {
            assert!(validate_tree_entry_name(name).is_err());
        }
        assert!(validate_tree_entry_name("README.md").is_ok());
    }

    #[test]
    fn maps_expected_errors_to_http_statuses() {
        assert_eq!(status_for_error("missing bearer token"), 401);
        assert_eq!(status_for_error("project access denied"), 403);
        assert_eq!(status_for_error("project is archived and read-only"), 403);
        assert_eq!(status_for_error("object not found"), 404);
        assert_eq!(status_for_error("invalid object id"), 400);
        assert_eq!(status_for_error("workspace head changed"), 409);
        assert_eq!(status_for_error("database unavailable"), 500);
    }

    #[test]
    fn hides_internal_server_errors() {
        assert_eq!(
            public_error_message(500, "database unavailable"),
            "internal server error"
        );
        assert_eq!(
            public_error_message(403, "project access denied"),
            "project access denied"
        );
    }
}
