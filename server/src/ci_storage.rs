use serde_json::json;
use sha2::{Digest, Sha256};
use worker::*;

use crate::release_support::{normalize_content_type, safe_file_name};
use crate::support::{bucket, db, json_error, object_size_limit, param, project_params, r2_bytes};
use crate::{check_project_capability, d1, require_auth};

pub(crate) async fn upload_ci_job_artifact(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let runner = crate::ci::require_ci_runner(&req, &ctx, true).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    let job_id = param(&ctx, "job_id")?;
    let artifact_name = normalize_artifact_name(&param(&ctx, "artifact_name")?)?;
    let database = db(&ctx)?;
    if !d1::ci_job_active_for_runner(database, &runner, &job_id).await? {
        return json_error(404, "active ci job not found");
    }
    let bytes = req.bytes().await?;
    let size_limit = object_size_limit(&ctx.env);
    if bytes.len() > size_limit {
        return json_error(
            413,
            "ci artifact is larger than the configured upload limit",
        );
    }
    let size = bytes.len();
    let Some(job) = d1::ci_job(database, &tenant, &project, &job_id).await? else {
        return json_error(404, "ci job not found");
    };
    let digest = hex::encode(Sha256::digest(&bytes));
    let content_type = req
        .headers()
        .get("content-type")?
        .map(|value| normalize_content_type(&value))
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let storage_key = ci_artifact_storage_key(&tenant, &project, &job_id, &artifact_name);
    bucket(&ctx.env)?
        .put(storage_key.clone(), bytes)
        .http_metadata(HttpMetadata {
            content_type: Some(content_type.clone()),
            content_disposition: Some(format!(
                "attachment; filename=\"{}\"",
                safe_file_name(&artifact_name)
            )),
            ..Default::default()
        })
        .execute()
        .await?;
    let artifact = d1::record_ci_artifact(
        database,
        &job,
        &artifact_name,
        &storage_key,
        size,
        &format!("sha256:{digest}"),
        &content_type,
    )
    .await?;
    d1::record_audit_event(
        database,
        &tenant,
        &project,
        "system",
        "ci.artifact_uploaded",
        "ci_job",
        &job_id,
        json!({ "artifact": artifact.id.clone(), "name": artifact.name.clone(), "size": artifact.size }),
    )
    .await?;
    prune_ci_storage_best_effort(database, &ctx.env, &tenant, &project).await;
    Response::from_json(&artifact)
}

pub(crate) async fn list_ci_job_artifacts(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let job_id = param(&ctx, "job_id")?;
    let database = db(&ctx)?;
    check_project_capability(
        database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "status_checks",
    )
    .await?;
    if d1::ci_job(database, &tenant, &project, &job_id)
        .await?
        .is_none()
    {
        return json_error(404, "ci job not found");
    }
    let artifacts = d1::list_ci_artifacts(database, &tenant, &project, &job_id)
        .await?
        .into_iter()
        .map(|artifact| {
            json!({
                "id": artifact.id,
                "job_id": artifact.job_id,
                "name": artifact.name,
                "size": artifact.size,
                "digest": artifact.digest,
                "content_type": artifact.content_type,
                "created_at": artifact.created_at,
                "download_url": format!("/v1/tenants/{tenant}/projects/{project}/ci/jobs/{job_id}/artifacts/{}/download", artifact.id),
            })
        })
        .collect::<Vec<_>>();
    Response::from_json(&json!({ "artifacts": artifacts }))
}

pub(crate) async fn download_ci_job_artifact(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let job_id = param(&ctx, "job_id")?;
    let artifact_id = param(&ctx, "artifact_id")?;
    let database = db(&ctx)?;
    check_project_capability(
        database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "status_checks",
    )
    .await?;
    let Some(artifact) =
        d1::ci_artifact_by_id(database, &tenant, &project, &job_id, &artifact_id).await?
    else {
        return json_error(404, "ci artifact not found");
    };
    let Some(object) = bucket(&ctx.env)?
        .get(artifact.storage_key)
        .execute()
        .await?
    else {
        return json_error(404, "ci artifact not found");
    };
    let Some(body) = object.body() else {
        return json_error(404, "ci artifact not found");
    };
    let mut response = Response::from_body(body.response_body()?)?;
    let headers = response.headers_mut();
    headers.set("content-type", &artifact.content_type)?;
    headers.set(
        "content-disposition",
        &format!(
            "attachment; filename=\"{}\"",
            safe_file_name(&artifact.name)
        ),
    )?;
    headers.set("etag", object.etag().as_str())?;
    Ok(response)
}

pub(crate) async fn restore_ci_cache(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let runner = crate::ci::require_ci_runner(&req, &ctx, true).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    let cache_key = normalize_cache_key(&param(&ctx, "cache_key")?)?;
    let database = db(&ctx)?;
    let Some(record) = d1::ci_cache_by_key(database, &tenant, &project, &cache_key).await? else {
        return json_error(404, "ci cache not found");
    };
    let bytes = r2_bytes(&bucket(&ctx.env)?, &record.storage_key).await?;
    let mut response = Response::from_bytes(bytes)?;
    let headers = response.headers_mut();
    headers.set("content-type", "application/octet-stream")?;
    headers.set("x-sty-cache-key", &record.cache_key)?;
    headers.set("x-sty-cache-format", &record.format)?;
    headers.set("x-sty-cache-digest", &record.digest)?;
    headers.set("x-sty-cache-updated-at", &record.updated_at)?;
    headers.set("x-sty-cache-size", &record.size.to_string())?;
    Ok(response)
}

pub(crate) async fn save_ci_cache(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let runner = crate::ci::require_ci_runner(&req, &ctx, true).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    let cache_key = normalize_cache_key(&param(&ctx, "cache_key")?)?;
    let bytes = req.bytes().await?;
    let size_limit = object_size_limit(&ctx.env);
    if bytes.len() > size_limit {
        return json_error(413, "ci cache is larger than the configured upload limit");
    }
    let size = bytes.len();
    let digest = format!("sha256:{}", hex::encode(Sha256::digest(&bytes)));
    let format = normalize_cache_format(&req)?;
    let storage_key = ci_cache_storage_key(&tenant, &project, &cache_key);
    bucket(&ctx.env)?
        .put(storage_key.clone(), bytes)
        .execute()
        .await?;
    let database = db(&ctx)?;
    let record = d1::upsert_ci_cache(
        database,
        &tenant,
        &project,
        &cache_key,
        &storage_key,
        &format,
        size,
        &digest,
    )
    .await?;
    prune_ci_storage_best_effort(database, &ctx.env, &tenant, &project).await;
    Response::from_json(&json!({
        "ok": true,
        "key": record.cache_key,
        "format": record.format,
        "size": record.size,
        "digest": record.digest,
        "updated_at": record.updated_at,
    }))
}

async fn prune_ci_storage_best_effort(
    database: &crate::request_context::Database,
    env: &Env,
    tenant: &str,
    project: &str,
) {
    if let Err(error) = prune_ci_storage(database, env, tenant, project).await {
        console_error!("ci storage prune failed: {}", error);
    }
}

async fn prune_ci_storage(
    database: &crate::request_context::Database,
    env: &Env,
    tenant: &str,
    project: &str,
) -> Result<()> {
    const PRUNE_LIMIT: u64 = 200;
    let settings = d1::project_settings(database, tenant, project, None).await?;
    let artifact_cutoff = rfc3339_days_ago(settings.ci.artifact_retention_days);
    let cache_cutoff = rfc3339_days_ago(settings.ci.cache_retention_days);
    let artifacts =
        d1::stale_ci_artifacts(database, tenant, project, &artifact_cutoff, PRUNE_LIMIT).await?;
    let caches = d1::stale_ci_caches(database, tenant, project, &cache_cutoff, PRUNE_LIMIT).await?;
    let keys = artifacts
        .iter()
        .map(|artifact| artifact.storage_key.clone())
        .chain(caches.iter().map(|cache| cache.storage_key.clone()))
        .collect::<Vec<_>>();
    for artifact in artifacts {
        d1::delete_ci_artifact(database, tenant, project, &artifact.id).await?;
    }
    for cache in caches {
        d1::delete_ci_cache(database, tenant, project, &cache.cache_key).await?;
    }
    if !keys.is_empty() {
        bucket(env)?.delete_multiple(keys).await?;
    }
    Ok(())
}

fn rfc3339_days_ago(days: u32) -> String {
    let seconds = days.clamp(1, 365) as f64 * 86_400.0;
    let millis = js_sys::Date::now() - seconds * 1000.0;
    js_sys::Date::new(&wasm_bindgen::JsValue::from_f64(millis))
        .to_iso_string()
        .into()
}

fn ci_artifact_storage_key(tenant: &str, project: &str, job_id: &str, name: &str) -> String {
    let nonce = uuid::Uuid::new_v4().simple();
    format!(
        "projects/{tenant}/{project}/ci/artifacts/{job_id}/{nonce}/{}",
        safe_file_name(name)
    )
}

fn ci_cache_storage_key(tenant: &str, project: &str, cache_key: &str) -> String {
    format!("projects/{tenant}/{project}/ci/cache/{cache_key}")
}

fn normalize_artifact_name(value: &str) -> Result<String> {
    let value = safe_file_name(value.trim());
    if value == "." || value == ".." || value.contains('/') || value.len() > 160 {
        return Err(Error::RustError("invalid ci artifact name".to_string()));
    }
    Ok(value)
}

fn normalize_cache_key(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 160
        || value.starts_with('/')
        || value.contains('/')
        || value.contains("..")
        || value.contains('\\')
        || value.chars().any(char::is_control)
    {
        return Err(Error::RustError("invalid ci cache key".to_string()));
    }
    Ok(value.to_string())
}

fn normalize_cache_format(req: &Request) -> Result<String> {
    let format = req
        .headers()
        .get("x-sty-cache-format")?
        .unwrap_or_else(|| "raw".to_string());
    match format.trim() {
        "" | "raw" => Ok("raw".to_string()),
        "tar.gz" => Ok("tar.gz".to_string()),
        _ => Err(Error::RustError("invalid ci cache format".to_string())),
    }
}
