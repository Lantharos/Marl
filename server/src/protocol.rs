use serde_json::json;
use sty_protocol::OkResponse;
use worker::*;

use crate::protocol_profiles::profile_json;
use crate::support::{db, json_error, paginate_vec, param, project_params};
use crate::{check_project_access, check_project_role, d1, optional_auth, require_auth};
pub async fn list_labels(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_protocol_kind(req, ctx, "label").await
}

pub async fn create_label(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_protocol_kind(req, ctx, "label").await
}

pub async fn list_milestones(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_protocol_kind(req, ctx, "milestone").await
}

pub async fn create_milestone(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_protocol_kind(req, ctx, "milestone").await
}

pub async fn list_protocol_comments(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_protocol_kind(req, ctx, "comment").await
}

pub async fn create_protocol_comment(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_protocol_kind(req, ctx, "comment").await
}

pub async fn list_hooks(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_protocol_kind(req, ctx, "hook").await
}

pub async fn create_hook(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_protocol_kind(req, ctx, "hook").await
}

pub async fn list_webhooks(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_protocol_kind(req, ctx, "webhook").await
}

pub async fn create_webhook(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_protocol_kind(req, ctx, "webhook").await
}

pub async fn list_tags(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_protocol_kind(req, ctx, "tag").await
}

pub async fn create_tag(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_protocol_kind(req, ctx, "tag").await
}

pub async fn list_keys(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_protocol_kind(req, ctx, "signing_key").await
}

pub async fn create_key(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_protocol_kind(req, ctx, "signing_key").await
}

pub async fn list_ssh_keys(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_protocol_kind(req, ctx, "ssh_key").await
}

pub async fn create_ssh_key(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_protocol_kind(req, ctx, "ssh_key").await
}

pub async fn search_project(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let url = req.url()?;
    let query = url
        .query_pairs()
        .find_map(|(k, v)| (k == "q").then(|| v.to_string()))
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mut results = Vec::new();
    for issue in d1::list_issues(&database, &tenant, &project).await? {
        if issue.title.to_ascii_lowercase().contains(&query)
            || issue.body.to_ascii_lowercase().contains(&query)
        {
            results.push(json!({ "type": "issue", "score": 1.0, "data": issue }));
        }
    }
    for entry in d1::project_history(&database, &tenant, &project).await? {
        if entry.message.to_ascii_lowercase().contains(&query) {
            results.push(json!({ "type": "snapshot", "score": 0.8, "data": entry }));
        }
    }
    Response::from_json(&paginate_vec(url, results))
}

pub async fn profile_me(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let database = db(&ctx.env)?;
    profile_json(&database, &user).await
}

pub async fn profile_user(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = optional_auth(&req, &ctx.env).await?;
    let database = db(&ctx.env)?;
    let user = param(&ctx, "item_id")?;
    profile_json(&database, &user).await
}

pub async fn list_reactions(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = optional_auth(&req, &ctx.env).await?;
    Response::from_json(&Vec::<serde_json::Value>::new())
}

pub async fn add_reaction(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_role(&database, &tenant, &project, &user, "contributor").await?;
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let emoji = body["emoji"].as_str().unwrap_or("+1");
    Response::from_json(&json!([{ "emoji": emoji, "count": 1, "reacted": true }]))
}

pub async fn delete_reaction(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_role(&database, &tenant, &project, &user, "contributor").await?;
    Response::from_json(&OkResponse { ok: true })
}

pub async fn verify_snapshot(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let result =
        crate::account_keys::verify_snapshot_id(&database, &ctx.env, &tenant, &project, &id)
            .await?;
    Response::from_json(&result)
}

pub async fn verify_all_snapshots(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let mut snapshots = Vec::new();
    for id in d1::object_ids_by_kind(&database, &tenant, &project, "snapshot").await? {
        snapshots.push(
            crate::account_keys::verify_snapshot_id(&database, &ctx.env, &tenant, &project, &id)
                .await?,
        );
    }
    let verified = snapshots
        .iter()
        .all(|snapshot| snapshot["verified"].as_bool().unwrap_or(false));
    Response::from_json(&json!({ "verified": verified, "snapshots": snapshots }))
}

pub async fn get_protocol_item(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let Some(item) = protocol_item(&database, &tenant, &project, &id).await? else {
        return json_error(404, "item not found");
    };
    Response::from_json(&item)
}

pub async fn delete_protocol_item(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    check_project_role(&database, &tenant, &project, &user, "maintainer").await?;
    let kind = protocol_item_kind(&database, &tenant, &project, &id).await?;
    database
        .prepare("DELETE FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND id = ?3")
        .bind(&[
            wasm_bindgen::JsValue::from_str(&tenant),
            wasm_bindgen::JsValue::from_str(&project),
            wasm_bindgen::JsValue::from_str(&id),
        ])?
        .run()
        .await?;
    if kind.as_deref() == Some("release") {
        d1::recompute_project_stats(&database, &tenant, &project).await?;
    }
    Response::from_json(&OkResponse { ok: true })
}

pub async fn close_protocol_item(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    check_project_role(&database, &tenant, &project, &user, "maintainer").await?;
    let Some(mut item) = protocol_item(&database, &tenant, &project, &id).await? else {
        return json_error(404, "item not found");
    };
    item["state"] = json!("closed");
    upsert_protocol_item(&database, &tenant, &project, "milestone", &id, item.clone()).await?;
    Response::from_json(&item)
}

pub async fn test_protocol_item(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    check_project_role(&database, &tenant, &project, &user, "maintainer").await?;
    Response::from_json(&json!({ "ok": true, "tested": id }))
}

async fn list_protocol_kind(req: Request, ctx: RouteContext<()>, kind: &str) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let result = database
        .prepare(
            "SELECT data_json FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = ?3 ORDER BY created_at DESC",
        )
        .bind(&[
            wasm_bindgen::JsValue::from_str(&tenant),
            wasm_bindgen::JsValue::from_str(&project),
            wasm_bindgen::JsValue::from_str(kind),
        ])?
        .all()
        .await?;
    #[derive(serde::Deserialize)]
    struct Row {
        data_json: String,
    }
    let rows: Vec<Row> = result.results()?;
    let items = rows
        .into_iter()
        .filter_map(|row| serde_json::from_str::<serde_json::Value>(&row.data_json).ok())
        .collect::<Vec<_>>();
    Response::from_json(&paginate_vec(req.url()?, items))
}

async fn create_protocol_kind(
    mut req: Request,
    ctx: RouteContext<()>,
    kind: &str,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let mut body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let database = db(&ctx.env)?;
    check_project_role(&database, &tenant, &project, &user, minimum_role_for_kind(kind)).await?;
    let id = body["id"]
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| body["name"].as_str().map(ToOwned::to_owned))
        .or_else(|| body["tag"].as_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| format!("{}-{}", kind, uuid::Uuid::new_v4().simple()));
    let now = js_sys::Date::new_0()
        .to_iso_string()
        .as_string()
        .unwrap_or_default();
    body["id"] = json!(id.clone());
    body["kind"] = json!(kind);
    if body["author"].is_null() {
        body["author"] = json!(user);
    }
    if body["created_at"].is_null() {
        body["created_at"] = json!(now.clone());
    }
    body["updated_at"] = json!(now);
    if kind == "milestone" && body["state"].is_null() {
        body["state"] = json!("open");
    }
    upsert_protocol_item(&database, &tenant, &project, kind, &id, body.clone()).await?;
    if kind == "release" {
        d1::recompute_project_stats(&database, &tenant, &project).await?;
    }
    Response::from_json(&body)
}

fn minimum_role_for_kind(kind: &str) -> &'static str {
    match kind {
        "comment" => "contributor",
        _ => "maintainer",
    }
}

async fn protocol_item_kind(
    database: &worker::D1Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<Option<String>> {
    #[derive(serde::Deserialize)]
    struct Row {
        kind: String,
    }
    let row: Option<Row> = database
        .prepare("SELECT kind FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND id = ?3")
        .bind(&[
            wasm_bindgen::JsValue::from_str(tenant),
            wasm_bindgen::JsValue::from_str(project),
            wasm_bindgen::JsValue::from_str(id),
        ])?
        .first(None)
        .await?;
    Ok(row.map(|row| row.kind))
}

async fn protocol_item(
    database: &worker::D1Database,
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
            "SELECT data_json FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND id = ?3",
        )
        .bind(&[
            wasm_bindgen::JsValue::from_str(tenant),
            wasm_bindgen::JsValue::from_str(project),
            wasm_bindgen::JsValue::from_str(id),
        ])?
        .first(None)
        .await?;
    row.map(|row| serde_json::from_str(&row.data_json).map_err(|e| Error::RustError(e.to_string())))
        .transpose()
}

async fn upsert_protocol_item(
    database: &worker::D1Database,
    tenant: &str,
    project: &str,
    kind: &str,
    id: &str,
    item: serde_json::Value,
) -> Result<()> {
    let now = js_sys::Date::new_0()
        .to_iso_string()
        .as_string()
        .unwrap_or_default();
    let data_json = serde_json::to_string(&item).map_err(|e| Error::RustError(e.to_string()))?;
    database
        .prepare(
            "INSERT INTO protocol_items (id, tenant, project, kind, number, data_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?6)
             ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at",
        )
        .bind(&[
            wasm_bindgen::JsValue::from_str(id),
            wasm_bindgen::JsValue::from_str(tenant),
            wasm_bindgen::JsValue::from_str(project),
            wasm_bindgen::JsValue::from_str(kind),
            wasm_bindgen::JsValue::from_str(&data_json),
            wasm_bindgen::JsValue::from_str(&now),
        ])?
        .run()
        .await?;
    Ok(())
}
