use serde_json::json;
use sha2::{Digest, Sha256};
use sty_protocol::TokenPrincipal;
use worker::*;

use crate::release_support::*;
use crate::support::{
    apply_cache_headers, bucket, db, json_error, object_size_limit, paginate_vec, param,
    project_params,
};
use crate::{
    check_project_read_capability, check_project_write_capability, d1, optional_auth, require_auth,
};

pub async fn list_releases(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    release_public_cache(&database, &tenant, &project, user.as_deref()).await?;
    let items = list_release_values(&database, &tenant, &project).await?;
    Response::from_json(&paginate_vec(req.url()?, items))
}

pub async fn create_release(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let mut body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let tag = body["tag"].as_str().unwrap_or_default().trim().to_string();
    if tag.is_empty() {
        return json_error(400, "release requires a tag");
    }
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "releases:write",
    )
    .await?;

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
    let _ = crate::developer::emit_project_event(
        &ctx,
        &tenant,
        &project,
        "release.created",
        json!({ "release": body.clone(), "actor": user }),
    );
    Response::from_json(&body)
}

pub async fn get_release(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx)?;
    release_public_cache(&database, &tenant, &project, user.as_deref()).await?;
    let Some(item) = release_item_by_id_or_tag(&database, &tenant, &project, &id).await? else {
        return json_error(404, "release not found");
    };
    Response::from_json(&item)
}

pub async fn upload_release_artifact(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let release_id = param(&ctx, "item_id")?;
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "releases:write",
    )
    .await?;
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
    let _ = crate::developer::emit_project_event(
        &ctx,
        &tenant,
        &project,
        "release.artifact_uploaded",
        json!({ "release": release.clone(), "actor": user }),
    );
    Response::from_json(&release)
}

pub async fn download_release_artifact(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let release_id = param(&ctx, "item_id")?;
    let artifact_id = param(&ctx, "artifact_id")?;
    let database = db(&ctx)?;
    let public_cache = release_public_cache(&database, &tenant, &project, user.as_deref()).await?;
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

async fn release_public_cache(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<bool> {
    let public_project = matches!(
        d1::project_visibility(database, tenant, project).await?,
        Some(visibility) if visibility == "public"
    );
    let public_releases = d1::project_public_releases(database, tenant, project).await?;
    if public_project || public_releases {
        return Ok(true);
    }
    check_project_read_capability(database, tenant, project, user, "releases:read").await?;
    Ok(false)
}
