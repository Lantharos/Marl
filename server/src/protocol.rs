use serde_json::json;
use sty_protocol::OkResponse;
use worker::*;

use crate::protocol_profiles::profile_json;
use crate::support::{
    db, json_error, paginate_vec, param, project_params, query_text, value_matches_query,
};
use crate::{
    check_project_capability, check_project_read_capability, check_project_write_capability, d1,
    check_workspace_read_capability, optional_auth, require_auth, visible_project_leaves,
};
pub async fn list_labels(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    list_protocol_kind(req, ctx, "label").await
}

pub async fn create_label(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    create_protocol_kind(req, ctx, "label").await
}

pub async fn list_milestones(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    list_protocol_kind(req, ctx, "milestone").await
}

pub async fn create_milestone(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    create_protocol_kind(req, ctx, "milestone").await
}

pub async fn list_protocol_comments(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    list_protocol_kind(req, ctx, "comment").await
}

pub async fn create_protocol_comment(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    create_protocol_kind(req, ctx, "comment").await
}

pub async fn update_protocol_comment(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx)?;
    let Some(mut item) = protocol_item(&database, &tenant, &project, &id).await? else {
        return json_error(404, "item not found");
    };
    if item["kind"].as_str() != Some("comment") {
        return json_error(404, "item not found");
    }
    if !protocol_comment_visible(&database, &tenant, &project, Some(&user), &item).await? {
        return json_error(404, "item not found");
    }
    if d1::project_is_archived(&database, &tenant, &project).await? {
        return json_error(403, "project is archived and read-only");
    }
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let next_body = body["body"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let next_state = body["state"]
        .as_str()
        .filter(|value| matches!(*value, "open" | "resolved"));
    if next_body.is_none() && next_state.is_none() {
        return json_error(400, "missing comment update");
    }
    if next_body.is_some() && item["author"].as_str() != Some(user.as_str()) {
        return json_error(403, "only the comment author can edit this comment");
    }
    if next_state.is_some() {
        check_project_write_capability(
            &database,
            &tenant,
            &project,
            &user,
            "contributor",
            "issues:write",
        )
        .await?;
    }
    let now = js_sys::Date::new_0()
        .to_iso_string()
        .as_string()
        .unwrap_or_default();
    if let Some(next_body) = next_body {
        item["body"] = json!(next_body);
    }
    if let Some(next_state) = next_state {
        item["state"] = json!(next_state);
    }
    item["updated_at"] = json!(now);
    upsert_protocol_item(&database, &tenant, &project, "comment", &id, item.clone()).await?;
    enrich_protocol_comment_profiles(&database, std::slice::from_mut(&mut item)).await?;
    Response::from_json(&item)
}

pub async fn list_hooks(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    list_protocol_kind(req, ctx, "hook").await
}

pub async fn create_hook(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    create_protocol_kind(req, ctx, "hook").await
}

pub async fn list_tags(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    list_protocol_kind(req, ctx, "tag").await
}

pub async fn create_tag(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    create_protocol_kind(req, ctx, "tag").await
}

pub async fn list_keys(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    list_protocol_kind(req, ctx, "signing_key").await
}

pub async fn create_key(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    create_protocol_kind(req, ctx, "signing_key").await
}

pub async fn list_ssh_keys(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    list_protocol_kind(req, ctx, "ssh_key").await
}

pub async fn create_ssh_key(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    create_protocol_kind(req, ctx, "ssh_key").await
}

pub async fn search_project(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "issues:read")
        .await?;
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
    for leaf in visible_project_leaves(&database, &tenant, &project, user.as_deref()).await? {
        if leaf.title.to_ascii_lowercase().contains(&query)
            || leaf.body.to_ascii_lowercase().contains(&query)
            || leaf
                .tags
                .iter()
                .any(|tag| tag.to_ascii_lowercase().contains(&query))
        {
            results.push(json!({ "type": "leaf", "score": 0.9, "data": leaf }));
        }
    }
    Response::from_json(&paginate_vec(url, results))
}

pub async fn profile_me(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    profile_json(&database, &user).await
}

pub async fn profile_user(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let _ = optional_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let user = param(&ctx, "item_id")?;
    profile_json(&database, &user).await
}

pub async fn list_reactions(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        "issues:read",
    )
    .await?;
    let Some((target_kind, target_id)) =
        resolve_reaction_target(&database, &tenant, &project, &ctx).await?
    else {
        return json_error(404, "reaction target not found");
    };
    if target_kind == "comment"
        && !protocol_comment_id_visible(
            &database,
            &tenant,
            &project,
            user.as_deref(),
            &target_id,
        )
        .await?
    {
        return json_error(404, "reaction target not found");
    }
    let reactions = d1::list_reactions(
        &database,
        &tenant,
        &project,
        &target_kind,
        &target_id,
        user.as_deref(),
    )
    .await?;
    Response::from_json(&reactions)
}

pub async fn add_reaction(
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
        "contributor",
        "issues:write",
    )
    .await?;
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let emoji = body["emoji"]
        .as_str()
        .or_else(|| body["content"].as_str())
        .unwrap_or("+1");
    let emoji = normalize_reaction(emoji)?;
    let Some((target_kind, target_id)) =
        resolve_reaction_target(&database, &tenant, &project, &ctx).await?
    else {
        return json_error(404, "reaction target not found");
    };
    if target_kind == "comment"
        && !protocol_comment_id_visible(&database, &tenant, &project, Some(&user), &target_id)
            .await?
    {
        return json_error(404, "reaction target not found");
    }
    let reactions = d1::add_reaction(
        &database,
        &tenant,
        &project,
        &target_kind,
        &target_id,
        &user,
        &emoji,
    )
    .await?;
    Response::from_json(&reactions)
}

pub async fn delete_reaction(
    req: Request,
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
        "contributor",
        "issues:write",
    )
    .await?;
    let emoji = normalize_reaction(&param(&ctx, "reaction")?)?;
    let Some((target_kind, target_id)) =
        resolve_reaction_target(&database, &tenant, &project, &ctx).await?
    else {
        return json_error(404, "reaction target not found");
    };
    if target_kind == "comment"
        && !protocol_comment_id_visible(&database, &tenant, &project, Some(&user), &target_id)
            .await?
    {
        return json_error(404, "reaction target not found");
    }
    d1::delete_reaction(
        &database,
        &tenant,
        &project,
        &target_kind,
        &target_id,
        &user,
        &emoji,
    )
    .await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn resolve_reaction_target(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    ctx: &crate::request_context::AppRouteContext,
) -> Result<Option<(String, String)>> {
    if let Some(item_id) = ctx.param("item_id") {
        let Some(item) = protocol_item(database, tenant, project, item_id).await? else {
            return Ok(None);
        };
        if item["kind"].as_str() != Some("comment") {
            return Ok(None);
        }
        return Ok(Some(("comment".to_string(), item_id.to_string())));
    }
    if let Some(issue_id) = ctx.param("issue_id") {
        let issue = d1::list_issues(database, tenant, project)
            .await?
            .into_iter()
            .find(|issue| {
                issue.id == issue_id.as_str() || issue.number.to_string() == issue_id.as_str()
            });
        return Ok(issue.map(|issue| ("issue".to_string(), issue.id)));
    }
    Ok(None)
}

fn normalize_reaction(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 32 || value.chars().any(char::is_control) {
        return Err(Error::RustError("invalid reaction".to_string()));
    }
    Ok(value.to_string())
}

pub async fn verify_snapshot(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "main:read")
        .await?;
    let result =
        crate::account_keys::verify_snapshot_id(&database, &ctx.env, &tenant, &project, &id)
            .await?;
    Response::from_json(&result)
}

pub async fn verify_all_snapshots(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "main:read")
        .await?;
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

pub async fn get_protocol_item(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx)?;
    let Some(item) = protocol_item(&database, &tenant, &project, &id).await? else {
        return json_error(404, "item not found");
    };
    let kind = item["kind"].as_str().unwrap_or_default();
    check_project_read_capability(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        read_scope_for_kind(kind),
    )
    .await?;
    if kind == "comment"
        && !protocol_comment_visible(&database, &tenant, &project, user.as_deref(), &item)
            .await?
    {
        return json_error(404, "item not found");
    }
    Response::from_json(&item)
}

pub async fn delete_protocol_item(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx)?;
    let kind = protocol_item_kind(&database, &tenant, &project, &id).await?;
    if kind.is_none() {
        return json_error(404, "item not found");
    }
    if kind.as_deref() == Some("comment") {
        let Some(item) = protocol_item(&database, &tenant, &project, &id).await? else {
            return json_error(404, "item not found");
        };
        if !protocol_comment_visible(&database, &tenant, &project, Some(&user), &item).await? {
            return json_error(404, "item not found");
        }
        if item["author"].as_str() == Some(user.as_str()) {
            if d1::project_is_archived(&database, &tenant, &project).await? {
                return json_error(403, "project is archived and read-only");
            }
        } else {
            check_project_write_capability(
                &database,
                &tenant,
                &project,
                &user,
                "maintainer",
                write_scope_for_kind("comment"),
            )
            .await?;
        }
    } else {
        check_project_write_capability(
            &database,
            &tenant,
            &project,
            &user,
            "maintainer",
            write_scope_for_kind(kind.as_deref().unwrap_or_default()),
        )
        .await?;
    }
    database
        .prepare("DELETE FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND id = ?3")
        .bind(&[
            wasm_bindgen::JsValue::from_str(&tenant),
            wasm_bindgen::JsValue::from_str(&project),
            wasm_bindgen::JsValue::from_str(&id),
        ])?
        .run()
        .await?;
    if kind.as_deref() == Some("comment") {
        d1::delete_reactions_for_target(&database, &tenant, &project, "comment", &id).await?;
    }
    if kind.as_deref() == Some("release") {
        d1::recompute_project_stats(&database, &tenant, &project).await?;
    }
    Response::from_json(&OkResponse { ok: true })
}

pub async fn close_protocol_item(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "issues:write",
    )
    .await?;
    let Some(mut item) = protocol_item(&database, &tenant, &project, &id).await? else {
        return json_error(404, "item not found");
    };
    item["state"] = json!("closed");
    upsert_protocol_item(&database, &tenant, &project, "milestone", &id, item.clone()).await?;
    Response::from_json(&item)
}

pub async fn test_protocol_item(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx)?;
    check_project_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "webhooks:write",
    )
    .await?;
    Response::from_json(&json!({ "ok": true, "tested": id }))
}

async fn list_protocol_kind(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
    kind: &str,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        read_scope_for_kind(kind),
    )
    .await?;
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
    let url = req.url()?;
    let query = query_text(&url, "q").map(|value| value.to_ascii_lowercase());
    let filters = protocol_item_filters(&url, kind);
    let mut items = rows
        .into_iter()
        .filter_map(|row| serde_json::from_str::<serde_json::Value>(&row.data_json).ok())
        .filter(|item| {
            filters
                .iter()
                .all(|(key, expected)| protocol_item_matches(item, key, expected))
        })
        .filter(|item| {
            query
                .as_deref()
                .is_none_or(|query| value_matches_query(item, query))
        })
        .collect::<Vec<_>>();
    if kind == "comment" {
        items = filter_visible_protocol_comments(
            &database,
            &tenant,
            &project,
            user.as_deref(),
            items,
        )
        .await?;
        enrich_protocol_comment_profiles(&database, &mut items).await?;
    }
    Response::from_json(&paginate_vec(url, items))
}

async fn filter_visible_protocol_comments(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
    items: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>> {
    let mut visible = Vec::new();
    for item in items {
        if !protocol_comment_visible(database, tenant, project, user, &item).await? {
            continue;
        }
        visible.push(item);
    }
    Ok(visible)
}

async fn enrich_protocol_comment_profiles(
    database: &crate::request_context::Database,
    items: &mut [serde_json::Value],
) -> Result<()> {
    let mut profiles = std::collections::HashMap::new();
    for item in items {
        let Some(author) = item["author"].as_str().map(ToOwned::to_owned) else {
            continue;
        };
        if !profiles.contains_key(&author) {
            profiles.insert(author.clone(), d1::user_profile(database, &author).await?);
        }
        if let Some(profile) = profiles.get(&author).cloned().flatten() {
            item["author_profile"] = json!(profile);
        }
    }
    Ok(())
}

fn protocol_item_filters(url: &Url, kind: &str) -> Vec<(String, String)> {
    if kind != "comment" {
        return Vec::new();
    }
    let filter_keys = [
        "target_type",
        "target_id",
        "workspace",
        "snapshot_id",
        "history_entry_id",
        "file",
        "line",
        "start_line",
        "end_line",
    ];
    url.query_pairs()
        .filter_map(|(key, value)| {
            filter_keys
                .contains(&key.as_ref())
                .then(|| (key.to_string(), value.to_string()))
        })
        .filter(|(_, value)| !value.trim().is_empty())
        .collect()
}

fn protocol_item_matches(item: &serde_json::Value, key: &str, expected: &str) -> bool {
    match item.get(key) {
        Some(value) if value.is_number() => value.to_string() == expected,
        Some(value) => value.as_str().is_some_and(|actual| actual == expected),
        None => false,
    }
}

fn protocol_comment_workspace(item: &serde_json::Value) -> Option<&str> {
    item["workspace"].as_str().filter(|value| !value.is_empty()).or_else(|| {
        item["target_type"]
            .as_str()
            .filter(|value| *value == "workspace")
            .and_then(|_| item["target_id"].as_str().filter(|value| !value.is_empty()))
    })
}

async fn protocol_comment_visible(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
    item: &serde_json::Value,
) -> Result<bool> {
    let Some(workspace) = protocol_comment_workspace(item) else {
        return Ok(true);
    };
    d1::workspace_can_read(database, tenant, project, user, workspace).await
}

async fn protocol_comment_id_visible(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
    id: &str,
) -> Result<bool> {
    let Some(item) = protocol_item(database, tenant, project, id).await? else {
        return Ok(false);
    };
    protocol_comment_visible(database, tenant, project, user, &item).await
}

async fn create_protocol_kind(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
    kind: &str,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let mut body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        minimum_role_for_kind(kind),
        write_scope_for_kind(kind),
    )
    .await?;
    if kind == "comment" {
        if let Some(workspace) = protocol_comment_workspace(&body) {
            check_workspace_read_capability(&database, &tenant, &project, Some(&user), workspace)
                .await?;
        }
    }
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
        body["author"] = json!(user.clone());
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
    if kind == "comment" {
        enrich_protocol_comment_profiles(&database, std::slice::from_mut(&mut body)).await?;
    }
    Response::from_json(&body)
}

fn minimum_role_for_kind(kind: &str) -> &'static str {
    match kind {
        "comment" => "contributor",
        _ => "maintainer",
    }
}

fn read_scope_for_kind(kind: &str) -> &'static str {
    match kind {
        "comment" | "label" | "milestone" => "issues:read",
        "release" | "tag" => "releases:read",
        "hook" => "webhooks:read",
        _ => "main:read",
    }
}

fn write_scope_for_kind(kind: &str) -> &'static str {
    match kind {
        "comment" | "label" | "milestone" => "issues:write",
        "release" | "tag" => "releases:write",
        "hook" => "webhooks:write",
        _ => "settings:write",
    }
}

async fn protocol_item_kind(
    database: &crate::request_context::Database,
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
    database: &crate::request_context::Database,
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
