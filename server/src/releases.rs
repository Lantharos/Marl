use serde_json::json;
use sha2::{Digest, Sha256};
use sty_protocol::TokenPrincipal;
use worker::*;

use crate::support::{
    apply_cache_headers, bucket, db, json_error, object_size_limit, paginate_vec, param,
    project_params,
};
use crate::{check_project_access, d1, optional_auth, project_write_error, require_auth};

pub async fn list_releases(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let items = list_release_values(&database, &tenant, &project).await?;
    Response::from_json(&paginate_vec(req.url()?, items))
}

pub async fn create_release(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let mut body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let tag = body["tag"].as_str().unwrap_or_default().trim().to_string();
    if tag.is_empty() {
        return json_error(400, "release requires a tag");
    }
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return project_write_error(&database, &tenant, &project).await;
    }

    let principal = TokenPrincipal { user: user.clone() };
    let settings = d1::project_settings(&database, &tenant, &project, Some(&principal)).await?;
    let latest_snapshot =
        d1::head(&database, &tenant, &project, &settings.default_workspace).await?;
    let tag_item = ensure_tag(
        &database,
        &tenant,
        &project,
        &tag,
        &user,
        latest_snapshot.as_deref(),
    )
    .await?;
    let now = now_iso();
    let snapshot = body["snapshot"]
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| latest_snapshot.clone())
        .or_else(|| tag_item["snapshot"].as_str().map(ToOwned::to_owned));
    let id = release_id(&tenant, &project, &tag);

    body["id"] = json!(id.clone());
    body["kind"] = json!("release");
    body["tag"] = json!(tag);
    if body["author"].is_null() {
        body["author"] = json!(user);
    }
    if body["created_at"].is_null() {
        body["created_at"] = json!(now.clone());
    }
    body["updated_at"] = json!(now);
    if let Some(snapshot) = snapshot {
        body["snapshot"] = json!(snapshot);
        body["source"] = json!({
            "snapshot": body["snapshot"],
            "workspace": settings.default_workspace,
        });
    }
    if body["artifacts"].is_null() {
        body["artifacts"] = json!([]);
    }
    upsert_release(&database, &tenant, &project, &id, body.clone()).await?;
    d1::recompute_project_stats(&database, &tenant, &project).await?;
    Response::from_json(&body)
}

pub async fn get_release(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let Some(item) = release_item_by_id_or_tag(&database, &tenant, &project, &id).await? else {
        return json_error(404, "release not found");
    };
    Response::from_json(&item)
}

pub async fn upload_release_artifact(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let release_id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return project_write_error(&database, &tenant, &project).await;
    }
    let Some(mut release) =
        release_item_by_id_or_tag(&database, &tenant, &project, &release_id).await?
    else {
        return json_error(404, "release not found");
    };
    let storage_release_id = release["id"]
        .as_str()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| release_id.clone());
    let form = req.form_data().await?;
    let file = match form.get("file") {
        Some(FormEntry::File(file)) => file,
        _ => return json_error(400, "artifact upload requires a file field"),
    };
    let size_limit = object_size_limit(&ctx.env);
    if file.size() > size_limit {
        return json_error(413, "artifact is larger than the configured upload limit");
    }
    let original_name = file.name();
    let file_name = safe_file_name(&original_name);
    let content_type = normalize_content_type(&file.type_());
    let bytes = file.bytes().await?;
    if bytes.len() > size_limit {
        return json_error(413, "artifact is larger than the configured upload limit");
    }
    let digest_bytes = Sha256::digest(&bytes);
    let digest = hex::encode(digest_bytes);
    let artifact_id = uuid::Uuid::new_v4().simple().to_string();
    let storage_key = release_artifact_key(
        &tenant,
        &project,
        &storage_release_id,
        &artifact_id,
        &file_name,
    );
    let metadata = HttpMetadata {
        content_type: Some(content_type.clone()),
        content_disposition: Some(format!(
            "attachment; filename=\"{}\"",
            file_name.replace('"', "'")
        )),
        ..Default::default()
    };
    bucket(&ctx.env)?
        .put(storage_key.clone(), bytes)
        .http_metadata(metadata)
        .sha256(digest_bytes.to_vec())
        .execute()
        .await?;

    let now = now_iso();
    let download_url =
        release_artifact_download_url(&tenant, &project, &storage_release_id, &artifact_id);
    let artifact = json!({
        "id": artifact_id,
        "name": original_name,
        "size": file.size(),
        "digest": format!("sha256:{digest}"),
        "content_type": content_type,
        "url": download_url,
        "download_url": download_url,
        "storage_key": storage_key,
        "uploaded_at": now,
        "uploaded_by": user,
    });
    if !release["artifacts"].is_array() {
        release["artifacts"] = json!([]);
    }
    let artifacts = release["artifacts"]
        .as_array_mut()
        .ok_or_else(|| Error::RustError("release artifacts must be an array".to_string()))?;
    artifacts.push(artifact);
    release["updated_at"] = json!(now_iso());
    upsert_release(
        &database,
        &tenant,
        &project,
        &storage_release_id,
        release.clone(),
    )
    .await?;
    Response::from_json(&release)
}

pub async fn download_release_artifact(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let release_id = param(&ctx, "item_id")?;
    let artifact_id = param(&ctx, "artifact_id")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let public_cache = matches!(
        d1::project_visibility(&database, &tenant, &project).await?,
        Some(visibility) if visibility == "public"
    );
    let Some(release) =
        release_item_by_id_or_tag(&database, &tenant, &project, &release_id).await?
    else {
        return json_error(404, "release not found");
    };
    let Some(artifact) = release_artifact(&release, &artifact_id) else {
        return json_error(404, "artifact not found");
    };
    let Some(storage_key) = artifact["storage_key"].as_str() else {
        return json_error(404, "artifact not found");
    };
    let store = bucket(&ctx.env)?;
    let Some(object) = store.get(storage_key).execute().await? else {
        return json_error(404, "artifact not found");
    };
    let Some(body) = object.body() else {
        return json_error(404, "artifact not found");
    };
    let mut response = Response::from_body(body.response_body()?)?;
    let headers = response.headers_mut();
    if let Some(content_type) = artifact["content_type"].as_str() {
        headers.set("content-type", content_type)?;
    }
    if let Some(name) = artifact["name"].as_str() {
        headers.set(
            "content-disposition",
            &format!("attachment; filename=\"{}\"", safe_file_name(name)),
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

async fn ensure_tag(
    database: &D1Database,
    tenant: &str,
    project: &str,
    tag: &str,
    user: &str,
    snapshot: Option<&str>,
) -> Result<serde_json::Value> {
    if let Some(item) = list_protocol_values(database, tenant, project, "tag")
        .await?
        .into_iter()
        .find(|item| {
            item["tag"].as_str() == Some(tag)
                || item["name"].as_str() == Some(tag)
                || item["id"].as_str() == Some(tag)
        })
    {
        return Ok(item);
    }
    let now = now_iso();
    let id = tag_id(tenant, project, tag);
    let mut item = json!({
        "id": id,
        "tag": tag,
        "name": tag,
        "author": user,
        "created_at": now,
        "updated_at": now,
    });
    if let Some(snapshot) = snapshot {
        item["snapshot"] = json!(snapshot);
    }
    upsert_protocol_item(
        database,
        tenant,
        project,
        "tag",
        item["id"].as_str().unwrap(),
        item.clone(),
    )
    .await?;
    Ok(item)
}

async fn list_release_values(
    database: &D1Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<serde_json::Value>> {
    list_protocol_values(database, tenant, project, "release").await
}

async fn list_protocol_values(
    database: &D1Database,
    tenant: &str,
    project: &str,
    kind: &str,
) -> Result<Vec<serde_json::Value>> {
    let result = database
        .prepare(
            "SELECT data_json FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = ?3 ORDER BY created_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(kind)])?
        .all()
        .await?;
    #[derive(serde::Deserialize)]
    struct Row {
        data_json: String,
    }
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .filter_map(|row| serde_json::from_str::<serde_json::Value>(&row.data_json).ok())
        .collect())
}

async fn release_item(
    database: &D1Database,
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
            "SELECT data_json FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = 'release' AND id = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(id)])?
        .first(None)
        .await?;
    row.map(|row| {
        serde_json::from_str(&row.data_json).map_err(|error| Error::RustError(error.to_string()))
    })
    .transpose()
}

async fn release_item_by_id_or_tag(
    database: &D1Database,
    tenant: &str,
    project: &str,
    id_or_tag: &str,
) -> Result<Option<serde_json::Value>> {
    if let Some(item) = release_item(database, tenant, project, id_or_tag).await? {
        return Ok(Some(item));
    }
    Ok(list_release_values(database, tenant, project)
        .await?
        .into_iter()
        .find(|item| item["tag"].as_str() == Some(id_or_tag)))
}

async fn upsert_release(
    database: &D1Database,
    tenant: &str,
    project: &str,
    id: &str,
    item: serde_json::Value,
) -> Result<()> {
    upsert_protocol_item(database, tenant, project, "release", id, item).await
}

async fn upsert_protocol_item(
    database: &D1Database,
    tenant: &str,
    project: &str,
    kind: &str,
    id: &str,
    item: serde_json::Value,
) -> Result<()> {
    let now = now_iso();
    let data_json =
        serde_json::to_string(&item).map_err(|error| Error::RustError(error.to_string()))?;
    database
        .prepare(
            "INSERT INTO protocol_items (id, tenant, project, kind, number, data_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?6)
             ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at",
        )
        .bind(&[
            js_str(id),
            js_str(tenant),
            js_str(project),
            js_str(kind),
            js_str(&data_json),
            js_str(&now),
        ])?
        .run()
        .await?;
    Ok(())
}

fn release_artifact<'a>(
    release: &'a serde_json::Value,
    artifact_id: &str,
) -> Option<&'a serde_json::Value> {
    release["artifacts"]
        .as_array()?
        .iter()
        .find(|artifact| artifact["id"].as_str() == Some(artifact_id))
}

fn release_id(tenant: &str, project: &str, tag: &str) -> String {
    let digest = hex::encode(Sha256::digest(
        format!("{tenant}/{project}:{tag}").as_bytes(),
    ));
    format!("release:{}", &digest[..24])
}

fn tag_id(tenant: &str, project: &str, tag: &str) -> String {
    let digest = hex::encode(Sha256::digest(
        format!("{tenant}/{project}:{tag}").as_bytes(),
    ));
    format!("tag:{}", &digest[..24])
}

fn release_artifact_key(
    tenant: &str,
    project: &str,
    release_id: &str,
    artifact_id: &str,
    file_name: &str,
) -> String {
    let release_key = release_id.replace(['/', '\\'], "_");
    format!(
        "projects/{tenant}/{project}/releases/{release_key}/artifacts/{artifact_id}/{file_name}"
    )
}

fn release_artifact_download_url(
    tenant: &str,
    project: &str,
    release_id: &str,
    artifact_id: &str,
) -> String {
    format!(
        "/v1/tenants/{}/projects/{}/releases/{}/artifacts/{}/download",
        tenant,
        project,
        percent_encode_component(release_id),
        artifact_id
    )
}

fn safe_file_name(value: &str) -> String {
    let safe = value
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | '"' | '\0'..='\u{1f}' => '_',
            ch => ch,
        })
        .collect::<String>();
    if safe.trim().is_empty() {
        "artifact.bin".to_string()
    } else {
        safe
    }
}

fn normalize_content_type(value: &str) -> String {
    if value.trim().is_empty() {
        "application/octet-stream".to_string()
    } else {
        value.to_string()
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

fn now_iso() -> String {
    js_sys::Date::new_0()
        .to_iso_string()
        .as_string()
        .unwrap_or_default()
}

fn js_str(value: &str) -> wasm_bindgen::JsValue {
    wasm_bindgen::JsValue::from_str(value)
}
