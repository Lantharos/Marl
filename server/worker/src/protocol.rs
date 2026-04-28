use serde_json::json;
use sty_protocol::OkResponse;
use worker::*;

use crate::support::{db, json_error, param, project_params};
use crate::{check_project_access, d1, optional_auth, require_auth};
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

pub async fn list_releases(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_protocol_kind(req, ctx, "release").await
}

pub async fn create_release(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_release_from_tag(req, ctx).await
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

pub async fn list_audit(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let entries = d1::project_history(&database, &tenant, &project).await?;
    Response::from_json(&paginate_vec(req.url()?, entries))
}

pub async fn list_ready(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let ready = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .filter(|workspace| workspace.is_ready)
        .map(|workspace| json!({
            "workspace": workspace.name,
            "author": "",
            "marked_at": "",
            "head": workspace.head,
            "intents": [],
            "ci_status": null,
            "reviewers": [],
            "approved_by": [],
        }))
        .collect::<Vec<_>>();
    Response::from_json(&paginate_vec(req.url()?, ready))
}

pub async fn get_ready(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace && item.is_ready);
    match state {
        Some(item) => Response::from_json(&json!({
            "workspace": item.name,
            "author": "",
            "marked_at": "",
            "head": item.head,
            "intents": [],
            "ci_status": null,
            "reviewers": [],
            "approved_by": [],
        })),
        None => json_error(404, "ready workspace not found"),
    }
}

pub async fn unmark_ready(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    d1::set_parent_workspace(&database, &tenant, &project, &workspace, None).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub async fn reject_ready(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = require_auth(&req, &ctx.env).await?;
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    Response::from_json(&json!({ "ok": true, "status": "rejected", "reason": body["reason"].clone() }))
}

pub async fn search_project(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let url = req.url()?;
    let query = url.query_pairs().find_map(|(k, v)| (k == "q").then(|| v.to_string())).unwrap_or_default().to_ascii_lowercase();
    let mut results = Vec::new();
    for issue in d1::list_issues(&database, &tenant, &project).await? {
        if issue.title.to_ascii_lowercase().contains(&query) || issue.body.to_ascii_lowercase().contains(&query) {
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
    profile_json(user)
}

pub async fn profile_user(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = optional_auth(&req, &ctx.env).await?;
    profile_json(param(&ctx, "item_id")?)
}

pub async fn list_reactions(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = optional_auth(&req, &ctx.env).await?;
    Response::from_json(&Vec::<serde_json::Value>::new())
}

pub async fn add_reaction(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = require_auth(&req, &ctx.env).await?;
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let emoji = body["emoji"].as_str().unwrap_or("+1");
    Response::from_json(&json!([{ "emoji": emoji, "count": 1, "reacted": true }]))
}

pub async fn delete_reaction(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = require_auth(&req, &ctx.env).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub async fn verify_snapshot(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let exists = d1::object_kind(&database, &tenant, &project, &id).await?.is_some();
    Response::from_json(&json!({
        "snapshot": id,
        "verified": false,
        "known": exists,
        "reason": "snapshot signature verification requires registered signing material",
    }))
}

pub async fn verify_all_snapshots(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    Response::from_json(&json!({
        "verified": false,
        "snapshots": [],
        "reason": "snapshot signature verification requires registered signing material",
    }))
}

fn profile_json(username: String) -> Result<Response> {
    Response::from_json(&json!({
        "username": username,
        "display_name": null,
        "bio": null,
        "avatar": null,
        "created_at": "",
        "public_projects": 0,
    }))
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
    let _ = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    database.prepare("DELETE FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND id = ?3")
        .bind(&[wasm_bindgen::JsValue::from_str(&tenant), wasm_bindgen::JsValue::from_str(&project), wasm_bindgen::JsValue::from_str(&id)])?
        .run()
        .await?;
    Response::from_json(&OkResponse { ok: true })
}

pub async fn close_protocol_item(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx.env)?;
    let Some(mut item) = protocol_item(&database, &tenant, &project, &id).await? else {
        return json_error(404, "item not found");
    };
    item["state"] = json!("closed");
    upsert_protocol_item(&database, &tenant, &project, "milestone", &id, item.clone()).await?;
    Response::from_json(&item)
}

pub async fn test_protocol_item(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = require_auth(&req, &ctx.env).await?;
    let id = param(&ctx, "item_id")?;
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

async fn create_protocol_kind(mut req: Request, ctx: RouteContext<()>, kind: &str) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let mut body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let id = body["id"]
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| body["name"].as_str().map(ToOwned::to_owned))
        .or_else(|| body["tag"].as_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| format!("{}-{}", kind, uuid::Uuid::new_v4().simple()));
    let now = js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default();
    body["id"] = json!(id.clone());
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
    Response::from_json(&body)
}

async fn create_release_from_tag(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let mut body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let tag = body["tag"].as_str().unwrap_or_default().trim().to_string();
    if tag.is_empty() {
        return json_error(400, "release requires an existing tag");
    }
    let database = db(&ctx.env)?;
    d1::ensure_project(
        &database,
        &tenant,
        &project,
        &sty_protocol::TokenPrincipal { user: user.clone() },
    )
    .await?;
    let tags = list_protocol_values(&database, &tenant, &project, "tag").await?;
    let tag_item = match tags.into_iter().find(|item| {
        item["tag"].as_str() == Some(tag.as_str())
            || item["name"].as_str() == Some(tag.as_str())
            || item["id"].as_str() == Some(tag.as_str())
    }) {
        Some(item) => item,
        None => {
            let tag_item = json!({
                "id": tag.clone(),
                "tag": tag.clone(),
                "name": tag.clone(),
                "author": user.clone(),
                "created_at": js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default()
            });
            upsert_protocol_item(&database, &tenant, &project, "tag", &tag, tag_item.clone()).await?;
            tag_item
        }
    };
    let now = js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default();
    let storage_id = format!("release:{tag}");
    body["id"] = json!(storage_id.clone());
    body["tag"] = json!(tag.clone());
    if body["author"].is_null() {
        body["author"] = json!(user);
    }
    if body["created_at"].is_null() {
        body["created_at"] = json!(now.clone());
    }
    body["updated_at"] = json!(now);
    if body["snapshot"].is_null() {
        body["snapshot"] = tag_item["snapshot"]
            .clone()
            .as_str()
            .map(|snapshot| json!(snapshot))
            .unwrap_or_else(|| tag_item["head"].clone());
    }
    upsert_protocol_item(&database, &tenant, &project, "release", &storage_id, body.clone()).await?;
    Response::from_json(&body)
}

async fn list_protocol_values(
    database: &worker::D1Database,
    tenant: &str,
    project: &str,
    kind: &str,
) -> Result<Vec<serde_json::Value>> {
    let result = database
        .prepare(
            "SELECT data_json FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = ?3 ORDER BY created_at DESC",
        )
        .bind(&[
            wasm_bindgen::JsValue::from_str(tenant),
            wasm_bindgen::JsValue::from_str(project),
            wasm_bindgen::JsValue::from_str(kind),
        ])?
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
        .prepare("SELECT data_json FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND id = ?3")
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
    let now = js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default();
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

pub(crate) fn paginate_vec<T: serde::Serialize>(url: Url, items: Vec<T>) -> sty_protocol::Paginated<T> {
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
    let page_items = items.into_iter().skip(start).take(per_page).collect::<Vec<_>>();
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
