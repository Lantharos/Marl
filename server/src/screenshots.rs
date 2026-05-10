use serde_json::json;
use sha2::{Digest, Sha256};
use worker::*;

use crate::release_support::{list_protocol_values, now_iso, safe_file_name};
use crate::support::{
    apply_cache_headers, bucket, db, delete_prefix, json_error, object_size_limit, paginate_vec,
    param, project_params, query_text, value_matches_query,
};
use crate::{
    check_project_read_capability, check_project_write_capability, d1, optional_auth, require_auth,
};

pub(crate) async fn list_screenshots(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "main:read")
        .await?;
    let url = req.url()?;
    let query = query_text(&url, "q").map(|value| value.to_ascii_lowercase());
    let mut items = screenshot_values(&database, &tenant, &project).await?;
    if let Some(query) = query.as_deref() {
        items.retain(|item| value_matches_query(item, query));
    }
    items.sort_by(|left, right| {
        right["featured"]
            .as_bool()
            .cmp(&left["featured"].as_bool())
            .then_with(|| {
                right["created_at"]
                    .as_str()
                    .cmp(&left["created_at"].as_str())
            })
    });
    Response::from_json(&paginate_vec(url, items))
}

pub(crate) async fn upload_screenshot(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "settings:write",
    )
    .await?;
    let form = req.form_data().await?;
    let file = match form.get("file") {
        Some(FormEntry::File(file)) => file,
        _ => return json_error(400, "screenshot upload requires a file field"),
    };
    let size_limit = object_size_limit(&ctx.env);
    if file.size() > size_limit {
        return json_error(413, "screenshot is larger than the configured upload limit");
    }
    let original_name = file.name();
    let file_name = safe_file_name(&original_name);
    let title = form_text(&form, "title")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| title_from_file_name(&original_name));
    let requested_featured = form_text(&form, "featured")
        .map(|value| value == "true" || value == "1")
        .unwrap_or(false);
    let bytes = file.bytes().await?;
    if bytes.len() > size_limit {
        return json_error(413, "screenshot is larger than the configured upload limit");
    }
    let content_type = screenshot_content_type(&bytes)?;
    let digest_bytes = Sha256::digest(&bytes);
    let digest = hex::encode(&digest_bytes);
    let id = format!("screenshot:{}", uuid::Uuid::new_v4().simple());
    let storage_key = screenshot_storage_key(&tenant, &project, &id, &file_name);
    bucket(&ctx.env)?
        .put(storage_key.clone(), bytes)
        .http_metadata(HttpMetadata {
            content_type: Some(content_type.to_string()),
            content_disposition: Some(format!(
                "inline; filename=\"{}\"",
                file_name.replace('"', "'")
            )),
            ..Default::default()
        })
        .sha256(digest_bytes.to_vec())
        .execute()
        .await?;

    let now = now_iso();
    let featured = requested_featured
        || screenshot_values(&database, &tenant, &project)
            .await?
            .is_empty();
    if featured {
        clear_featured_screenshots(&database, &tenant, &project, &id).await?;
    }
    let item = json!({
        "id": id,
        "kind": "screenshot",
        "title": title,
        "name": original_name,
        "size": file.size(),
        "digest": format!("sha256:{digest}"),
        "content_type": content_type,
        "download_url": screenshot_download_url(&tenant, &project, &id),
        "url": screenshot_download_url(&tenant, &project, &id),
        "storage_key": storage_key,
        "featured": featured,
        "uploaded_at": now,
        "uploaded_by": user,
        "created_at": now,
        "updated_at": now,
    });
    upsert_screenshot(&database, &tenant, &project, &id, item.clone()).await?;
    Response::from_json(&item)
}

pub(crate) async fn feature_screenshot(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = normalize_route_id(&param(&ctx, "item_id")?);
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "settings:write",
    )
    .await?;
    let Some(mut item) = screenshot_item(&database, &tenant, &project, &id).await? else {
        return json_error(404, "screenshot not found");
    };
    clear_featured_screenshots(&database, &tenant, &project, &id).await?;
    item["featured"] = json!(true);
    item["updated_at"] = json!(now_iso());
    upsert_screenshot(&database, &tenant, &project, &id, item.clone()).await?;
    Response::from_json(&item)
}

pub(crate) async fn delete_screenshot(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = normalize_route_id(&param(&ctx, "item_id")?);
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "settings:write",
    )
    .await?;
    let Some(item) = screenshot_item(&database, &tenant, &project, &id).await? else {
        return json_error(404, "screenshot not found");
    };
    if let Some(storage_key) = item["storage_key"].as_str() {
        let prefix = storage_key
            .rsplit_once('/')
            .map(|(prefix, _)| format!("{prefix}/"))
            .unwrap_or_else(|| storage_key.to_string());
        delete_prefix(&bucket(&ctx.env)?, &prefix).await?;
    }
    delete_screenshot_item(&database, &tenant, &project, &id).await?;
    if item["featured"].as_bool().unwrap_or(false) {
        feature_newest_screenshot(&database, &tenant, &project).await?;
    }
    Response::from_json(&json!({ "ok": true }))
}

pub(crate) async fn download_screenshot(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = normalize_route_id(&param(&ctx, "item_id")?);
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "main:read")
        .await?;
    let Some(item) = screenshot_item(&database, &tenant, &project, &id).await? else {
        return json_error(404, "screenshot not found");
    };
    let Some(storage_key) = item["storage_key"].as_str() else {
        return json_error(404, "screenshot not found");
    };
    let store = bucket(&ctx.env)?;
    let Some(object) = store.get(storage_key).execute().await? else {
        return json_error(404, "screenshot not found");
    };
    let Some(body) = object.body() else {
        return json_error(404, "screenshot not found");
    };
    let public_cache = matches!(
        d1::project_visibility(&database, &tenant, &project).await?,
        Some(visibility) if visibility == "public"
    );
    let mut response = Response::from_body(body.response_body()?)?;
    let headers = response.headers_mut();
    if let Some(content_type) = item["content_type"].as_str() {
        headers.set("content-type", content_type)?;
    }
    if let Some(name) = item["name"].as_str() {
        headers.set(
            "content-disposition",
            &format!("inline; filename=\"{}\"", safe_file_name(name)),
        )?;
    }
    apply_cache_headers(
        headers,
        object.etag().as_str(),
        public_cache,
        31_536_000,
        true,
    )?;
    Ok(response)
}

pub(crate) async fn featured_screenshot(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
) -> Result<Option<serde_json::Value>> {
    Ok(screenshot_values(database, tenant, project)
        .await?
        .into_iter()
        .find(|item| item["featured"].as_bool().unwrap_or(false)))
}

async fn screenshot_values(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<serde_json::Value>> {
    list_protocol_values(database, tenant, project, "screenshot").await
}

async fn screenshot_item(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<Option<serde_json::Value>> {
    #[derive(serde::Deserialize)]
    struct Row {
        data_json: String,
    }
    let row: Option<Row> = database
        .prepare(
            "SELECT data_json FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = 'screenshot' AND id = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(id)])?
        .first(None)
        .await?;
    row.map(|row| {
        serde_json::from_str(&row.data_json).map_err(|error| Error::RustError(error.to_string()))
    })
    .transpose()
}

async fn clear_featured_screenshots(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    except_id: &str,
) -> Result<()> {
    for mut item in screenshot_values(database, tenant, project).await? {
        let Some(id) = item["id"].as_str().map(ToOwned::to_owned) else {
            continue;
        };
        if id == except_id || !item["featured"].as_bool().unwrap_or(false) {
            continue;
        }
        item["featured"] = json!(false);
        item["updated_at"] = json!(now_iso());
        upsert_screenshot(database, tenant, project, &id, item).await?;
    }
    Ok(())
}

async fn feature_newest_screenshot(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
) -> Result<()> {
    let Some(mut item) = screenshot_values(database, tenant, project)
        .await?
        .into_iter()
        .next()
    else {
        return Ok(());
    };
    let Some(id) = item["id"].as_str().map(ToOwned::to_owned) else {
        return Ok(());
    };
    item["featured"] = json!(true);
    item["updated_at"] = json!(now_iso());
    upsert_screenshot(database, tenant, project, &id, item).await
}

async fn upsert_screenshot(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    id: &str,
    item: serde_json::Value,
) -> Result<()> {
    let now = now_iso();
    let data_json =
        serde_json::to_string(&item).map_err(|error| Error::RustError(error.to_string()))?;
    database
        .prepare(
            "INSERT INTO protocol_items (id, tenant, project, kind, number, data_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'screenshot', NULL, ?4, ?5, ?5)
             ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at",
        )
        .bind(&[
            js_str(id),
            js_str(tenant),
            js_str(project),
            js_str(&data_json),
            js_str(&now),
        ])?
        .run()
        .await?;
    Ok(())
}

async fn delete_screenshot_item(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<()> {
    database
        .prepare(
            "DELETE FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = 'screenshot' AND id = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(id)])?
        .run()
        .await?;
    Ok(())
}

fn form_text(form: &FormData, name: &str) -> Option<String> {
    match form.get(name) {
        Some(FormEntry::Field(value)) => Some(value),
        _ => None,
    }
}

fn screenshot_storage_key(tenant: &str, project: &str, id: &str, file_name: &str) -> String {
    let screenshot_key = id.replace(['/', '\\'], "_");
    format!("projects/{tenant}/{project}/screenshots/{screenshot_key}/{file_name}")
}

fn screenshot_download_url(tenant: &str, project: &str, id: &str) -> String {
    format!(
        "/v1/tenants/{tenant}/projects/{project}/screenshots/{}/download",
        percent_encode_component(id)
    )
}

fn screenshot_content_type(bytes: &[u8]) -> Result<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Ok("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Ok("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Ok("image/gif");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Ok("image/webp");
    }
    Err(Error::RustError(
        "invalid screenshot format; upload PNG, JPEG, GIF, or WebP".to_string(),
    ))
}

fn title_from_file_name(value: &str) -> String {
    let title = value
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(value)
        .replace(['-', '_'], " ")
        .trim()
        .to_string();
    if title.is_empty() {
        "Screenshot".to_string()
    } else {
        title
    }
}

fn percent_encode_component(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            byte => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}

fn normalize_route_id(value: &str) -> String {
    let decoded = percent_decode_component(value);
    let decoded_twice = percent_decode_component(&decoded);
    if decoded_twice != decoded {
        decoded_twice
    } else {
        decoded
    }
}

fn percent_decode_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                output.push((hi << 4) | lo);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(output).unwrap_or_else(|_| value.to_string())
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn js_str(value: &str) -> wasm_bindgen::JsValue {
    wasm_bindgen::JsValue::from_str(value)
}
