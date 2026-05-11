use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sty_protocol::{OkResponse, TokenPrincipal};
use worker::*;

use crate::release_support::*;
use crate::support::{
    apply_cache_headers, bucket, db, delete_prefix, json_error, object_size_limit, paginate_vec,
    param, project_params, query_text, value_matches_query,
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
    let can_manage = can_manage_releases(&database, &tenant, &project, user.as_deref()).await?;
    let mut items = list_release_values(&database, &tenant, &project).await?;
    if !can_manage {
        items.retain(|item| !release_is_draft(item));
    }
    let url = req.url()?;
    if let Some(query) = query_text(&url, "q") {
        let query = query.to_ascii_lowercase();
        items.retain(|item| value_matches_query(item, &query));
    }
    Response::from_json(&paginate_vec(url, items))
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
    let release_tag = tag.clone();
    body["tag"] = json!(release_tag);
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
    if let Some(snapshot) = body["snapshot"].as_str().map(ToOwned::to_owned) {
        let tag = body["tag"].as_str().unwrap_or("source").to_string();
        attach_release_source_archive(
            &ctx, &tenant, &project, &id, &tag, &snapshot, &user, &mut body,
        )
        .await?;
    }
    if body["draft"].as_bool().unwrap_or(false) {
        body["latest"] = json!(false);
    } else if body["latest"].as_bool().unwrap_or(false) {
        clear_latest_releases(&database, &tenant, &project, &id).await?;
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

pub async fn update_release(
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
    let body: Value = req.json().await.unwrap_or_else(|_| json!({}));
    if body.get("name").is_some() {
        release["name"] = body["name"].clone();
    }
    if body.get("notes").is_some() {
        release["notes"] = body["notes"].clone();
    }
    if let Some(prerelease) = body["prerelease"].as_bool() {
        release["prerelease"] = json!(prerelease);
    }
    if let Some(draft) = body["draft"].as_bool() {
        release["draft"] = json!(draft);
    }
    if let Some(latest) = body["latest"].as_bool() {
        release["latest"] = json!(latest);
    }
    if release["draft"].as_bool().unwrap_or(false) {
        release["latest"] = json!(false);
    } else if release["latest"].as_bool().unwrap_or(false) {
        clear_latest_releases(&database, &tenant, &project, &storage_release_id).await?;
    }
    release["updated_at"] = json!(now_iso());
    if let Some(snapshot) = release["snapshot"]
        .as_str()
        .or_else(|| release["source"]["snapshot"].as_str())
        .map(ToOwned::to_owned)
    {
        let tag = release["tag"].as_str().unwrap_or("source").to_string();
        attach_release_source_archive(
            &ctx,
            &tenant,
            &project,
            &storage_release_id,
            &tag,
            &snapshot,
            &user,
            &mut release,
        )
        .await?;
    }
    upsert_release(
        &database,
        &tenant,
        &project,
        &storage_release_id,
        release.clone(),
    )
    .await?;
    d1::recompute_project_stats(&database, &tenant, &project).await?;
    let _ = crate::developer::emit_project_event(
        &ctx,
        &tenant,
        &project,
        "release.updated",
        json!({ "release": release.clone(), "actor": user }),
    );
    Response::from_json(&release)
}

pub async fn delete_release(
    req: Request,
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
    let Some(release) =
        release_item_by_id_or_tag(&database, &tenant, &project, &release_id).await?
    else {
        return json_error(404, "release not found");
    };
    let storage_release_id = release["id"]
        .as_str()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| release_id.clone());
    delete_release_item(&database, &tenant, &project, &storage_release_id).await?;
    let release_key = storage_release_id.replace(['/', '\\'], "_");
    let prefix = format!("projects/{tenant}/{project}/releases/{release_key}/");
    delete_prefix(&bucket(&ctx.env)?, &prefix).await?;
    d1::recompute_project_stats(&database, &tenant, &project).await?;
    let _ = crate::developer::emit_project_event(
        &ctx,
        &tenant,
        &project,
        "release.deleted",
        json!({ "release": release, "actor": user }),
    );
    Response::from_json(&OkResponse { ok: true })
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
    if release_is_draft(&item)
        && !can_manage_releases(&database, &tenant, &project, user.as_deref()).await?
    {
        return json_error(404, "release not found");
    }
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
    let digest = hex::encode(&digest_bytes);
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
    let (tenant, project) = project_params(&ctx)?;
    let release_id = param(&ctx, "item_id")?;
    let artifact_id = param(&ctx, "artifact_id")?;
    let database = db(&ctx)?;
    let public_project = release_source_downloads_are_public(&database, &tenant, &project).await?;
    let public_release_downloads = public_project
        || d1::project_public_releases(&database, &tenant, &project).await?;
    let user = if public_release_downloads {
        optional_auth(&req, &ctx).await.unwrap_or(None)
    } else {
        optional_auth(&req, &ctx).await?
    };
    let Some(release) =
        release_item_by_id_or_tag(&database, &tenant, &project, &release_id).await?
    else {
        return json_error(404, "release not found");
    };
    if release_is_draft(&release)
        && !can_manage_releases(&database, &tenant, &project, user.as_deref()).await?
    {
        return json_error(404, "release not found");
    }
    let Some(artifact) = release_artifact(&release, &artifact_id) else {
        return json_error(404, "artifact not found");
    };
    let source_artifact = artifact["source"].as_bool().unwrap_or(false)
        || artifact["id"].as_str() == Some(release_source_artifact_id());
    let public_cache = if source_artifact {
        public_project
    } else {
        public_release_downloads
    };
    if !public_cache {
        check_project_read_capability(
            &database,
            &tenant,
            &project,
            user.as_deref(),
            "releases:read",
        )
        .await?;
    }
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
    if release_downloads_are_public(database, tenant, project).await? {
        return Ok(true);
    }
    check_project_read_capability(database, tenant, project, user, "releases:read").await?;
    Ok(false)
}

async fn release_downloads_are_public(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
) -> Result<bool> {
    let public_project = release_source_downloads_are_public(database, tenant, project).await?;
    Ok(public_project || d1::project_public_releases(database, tenant, project).await?)
}

async fn release_source_downloads_are_public(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
) -> Result<bool> {
    let public_project = matches!(
        d1::project_visibility(database, tenant, project).await?,
        Some(visibility) if visibility == "public"
    );
    Ok(public_project)
}

async fn can_manage_releases(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<bool> {
    let Some(user) = user else {
        return Ok(false);
    };
    if user.starts_with("api-key:") {
        return Ok(
            d1::project_api_key_allows(database, tenant, project, user, "releases:write")
                .await?
                .unwrap_or(false),
        );
    }
    d1::project_role_allows(database, tenant, project, user, "maintainer").await
}

fn release_is_draft(release: &Value) -> bool {
    release["draft"].as_bool().unwrap_or(false)
}

async fn attach_release_source_archive(
    ctx: &crate::request_context::AppRouteContext,
    tenant: &str,
    project: &str,
    release_id: &str,
    tag: &str,
    snapshot: &str,
    user: &str,
    release: &mut Value,
) -> Result<()> {
    if release_has_source_artifact(release) {
        return Ok(());
    }
    let store = bucket(&ctx.env)?;
    let bytes =
        crate::source_archive::source_zip_bytes_for_snapshot(&store, tenant, project, snapshot)
            .await?;
    let size = bytes.len();
    let digest_bytes = Sha256::digest(&bytes);
    let digest = hex::encode(digest_bytes);
    let file_name = release_source_artifact_name(project, tag);
    let storage_key = release_source_artifact_key(tenant, project, release_id, &file_name);
    let metadata = HttpMetadata {
        content_type: Some("application/zip".to_string()),
        content_disposition: Some(format!(
            "attachment; filename=\"{}\"",
            file_name.replace('"', "'")
        )),
        ..Default::default()
    };
    store
        .put(storage_key.clone(), bytes)
        .http_metadata(metadata)
        .sha256(digest_bytes.to_vec())
        .execute()
        .await?;

    let now = now_iso();
    let artifact_id = release_source_artifact_id().to_string();
    let download_url = release_artifact_download_url(tenant, project, release_id, &artifact_id);
    let artifact = json!({
        "id": artifact_id,
        "name": file_name,
        "size": size,
        "digest": format!("sha256:{digest}"),
        "content_type": "application/zip",
        "url": download_url,
        "download_url": download_url,
        "storage_key": storage_key,
        "source": true,
        "snapshot": snapshot,
        "uploaded_at": now,
        "uploaded_by": user,
    });
    if !release["artifacts"].is_array() {
        release["artifacts"] = json!([]);
    }
    let artifacts = release["artifacts"]
        .as_array_mut()
        .ok_or_else(|| Error::RustError("release artifacts must be an array".to_string()))?;
    artifacts.retain(|item| {
        !item["source"].as_bool().unwrap_or(false)
            && item["id"].as_str() != Some(release_source_artifact_id())
    });
    artifacts.insert(0, artifact);
    if !release["source"].is_object() {
        release["source"] = json!({});
    }
    release["source"]["snapshot"] = json!(snapshot);
    if release["source"]["workspace"].is_null() {
        release["source"]["workspace"] = json!("main");
    }
    release["source"]["artifact_id"] = json!(release_source_artifact_id());
    Ok(())
}
