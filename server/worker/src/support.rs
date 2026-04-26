use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::json;
use sha2::{Digest, Sha256};
use sty_protocol::{RemoteObject, validate_segment};
use worker::*;

pub fn bucket(env: &Env) -> Result<Bucket> {
    env.bucket("STY_OBJECTS")
}

pub fn db(env: &Env) -> Result<D1Database> {
    env.d1("STY_DB")
}

pub fn project_params(ctx: &RouteContext<()>) -> Result<(String, String)> {
    let tenant = param(ctx, "tenant")?;
    let project = param(ctx, "project")?;
    validate_segment(&tenant).map_err(|e| Error::RustError(e.to_string()))?;
    validate_segment(&project).map_err(|e| Error::RustError(e.to_string()))?;
    Ok((tenant, project))
}

pub fn param(ctx: &RouteContext<()>, name: &str) -> Result<String> {
    ctx.param(name)
        .map(ToOwned::to_owned)
        .ok_or_else(|| Error::RustError(format!("missing route param {name}")))
}

pub fn object_key(tenant: &str, project: &str, id: &str) -> String {
    format!("projects/{tenant}/{project}/objects/{id}")
}

pub fn object_chunk_key(tenant: &str, project: &str, id: &str, chunk_index: usize) -> String {
    format!("projects/{tenant}/{project}/objects/.uploads/{id}/{chunk_index}.chunk")
}

pub fn validate_object(object: &RemoteObject) -> Result<()> {
    validate_object_metadata(&object.id, &object.kind)?;
    let bytes = decode_base64(&object.bytes_base64)?;
    let digest = hex::encode(Sha256::digest(&bytes));
    if digest != object.id {
        return Err(Error::RustError(
            "object id does not match SHA-256 digest".to_string(),
        ));
    }
    Ok(())
}

pub fn validate_object_metadata(id: &str, kind: &str) -> Result<()> {
    if !matches!(kind, "blob" | "tree" | "snapshot") {
        return Err(Error::RustError("unknown object kind".to_string()));
    }
    if id.len() != 64 || !id.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(Error::RustError("invalid object id".to_string()));
    }
    Ok(())
}

pub fn required_header(req: &Request, name: &str) -> Result<String> {
    req.headers()
        .get(name)?
        .ok_or_else(|| Error::RustError(format!("missing {name} header")))
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

pub fn json_error(status: u16, message: &str) -> Result<Response> {
    with_cors(Response::from_json(&json!({ "error": message }))?.with_status(status))
}

pub fn decode_base64(value: &str) -> Result<Vec<u8>> {
    BASE64
        .decode(value)
        .map_err(|e| Error::RustError(e.to_string()))
}

pub fn preflight_response(req: &Request) -> Result<Response> {
    let mut response = Response::empty()?.with_status(204);
    apply_cors(req, &mut response)?;
    Ok(response)
}

pub fn with_cors(mut response: Response) -> Result<Response> {
    set_cors_headers(response.headers_mut())?;
    Ok(response)
}

pub fn apply_cors(req: &Request, response: &mut Response) -> Result<()> {
    let origin = req.headers().get("origin")?;
    if allowed_origin(origin.as_deref()) {
        let headers = response.headers_mut();
        headers.set("access-control-allow-origin", origin.unwrap().as_str())?;
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
        "authorization,content-type,x-pig-object-kind,x-pig-chunk-count,x-pig-total-size",
    )?;
    headers.set("access-control-max-age", "86400")?;
    Ok(())
}

fn allowed_origin(origin: Option<&str>) -> bool {
    matches!(
        origin,
        Some("http://localhost:5173")
            | Some("http://127.0.0.1:5173")
            | Some("http://localhost:4173")
            | Some("http://127.0.0.1:4173")
    )
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
