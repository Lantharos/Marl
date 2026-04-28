use std::collections::BTreeMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::json;
use sty_protocol::OkResponse;
use sty_store::Store as _;

use crate::server::{
    AppState, check_project_access, error, map_result, map_store_result, optional_auth, paginate,
    require_auth,
};
pub async fn list_labels(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    list_protocol_kind(state, headers, tenant, project, "label", query)
}

pub async fn create_label(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    create_protocol_kind(state, headers, tenant, project, "label", body)
}

pub async fn list_milestones(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    list_protocol_kind(state, headers, tenant, project, "milestone", query)
}

pub async fn create_milestone(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    create_protocol_kind(state, headers, tenant, project, "milestone", body)
}

pub async fn list_protocol_comments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    list_protocol_kind(state, headers, tenant, project, "comment", query)
}

pub async fn create_protocol_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    create_protocol_kind(state, headers, tenant, project, "comment", body)
}

pub async fn list_hooks(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    list_protocol_kind(state, headers, tenant, project, "hook", query)
}

pub async fn create_hook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    create_protocol_kind(state, headers, tenant, project, "hook", body)
}

pub async fn list_webhooks(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    list_protocol_kind(state, headers, tenant, project, "webhook", query)
}

pub async fn create_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    create_protocol_kind(state, headers, tenant, project, "webhook", body)
}

pub async fn list_releases(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    list_protocol_kind(state, headers, tenant, project, "release", query)
}

pub async fn create_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    create_release_from_tag(state, headers, tenant, project, body)
}

pub async fn list_tags(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    list_protocol_kind(state, headers, tenant, project, "tag", query)
}

pub async fn create_tag(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    create_protocol_kind(state, headers, tenant, project, "tag", body)
}

pub async fn list_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    list_protocol_kind(state, headers, tenant, project, "signing_key", query)
}

pub async fn create_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    create_protocol_kind(state, headers, tenant, project, "signing_key", body)
}

pub async fn list_ssh_keys(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    list_protocol_kind(state, headers, tenant, project, "ssh_key", query)
}

pub async fn create_ssh_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    create_protocol_kind(state, headers, tenant, project, "ssh_key", body)
}

pub async fn get_protocol_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, item_id)): Path<(String, String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        map_result(state.store.get_protocol_item(&tenant, &project, &item_id))?
            .ok_or_else(|| error(StatusCode::NOT_FOUND, "item not found"))
    }) {
        Ok(item) => Json(item).into_response(),
        Err(response) => response,
    }
}

pub async fn delete_protocol_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, item_id)): Path<(String, String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(
            state
                .store
                .delete_protocol_item(&tenant, &project, &item_id),
        )
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

pub async fn close_protocol_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, item_id)): Path<(String, String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let mut item = map_result(state.store.get_protocol_item(&tenant, &project, &item_id))?
            .ok_or_else(|| error(StatusCode::NOT_FOUND, "item not found"))?;
        item["state"] = json!("closed");
        map_result(
            state
                .store
                .upsert_protocol_item(&tenant, &project, "milestone", &item_id, item),
        )
    }) {
        Ok(item) => Json(item).into_response(),
        Err(response) => response,
    }
}

pub async fn list_ready(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        let items = map_result(state.store.workspace_states(&tenant, &project))?
            .into_iter()
            .filter(|workspace| workspace.is_ready)
            .map(|workspace| {
                json!({
                    "workspace": workspace.name,
                    "author": "",
                    "marked_at": "",
                    "head": workspace.head,
                    "intents": [],
                    "ci_status": null,
                    "reviewers": [],
                    "approved_by": []
                })
            })
            .collect::<Vec<_>>();
        Ok(paginate(items, &query))
    }) {
        Ok(items) => Json(items).into_response(),
        Err(response) => response,
    }
}

pub async fn get_ready(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        let item = map_result(state.store.workspace_states(&tenant, &project))?
            .into_iter()
            .find(|item| item.name == workspace && item.is_ready)
            .ok_or_else(|| error(StatusCode::NOT_FOUND, "ready workspace not found"))?;
        Ok(json!({
            "workspace": item.name,
            "author": "",
            "marked_at": "",
            "head": item.head,
            "intents": [],
            "ci_status": null,
            "reviewers": [],
            "approved_by": []
        }))
    }) {
        Ok(item) => Json(item).into_response(),
        Err(response) => response,
    }
}

pub async fn unmark_ready(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(
            state
                .store
                .set_parent_workspace(&tenant, &project, &workspace, None),
        )
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

pub async fn reject_ready(Json(body): Json<serde_json::Value>) -> Response {
    Json(json!({ "ok": true, "status": "rejected", "reason": body["reason"].clone() }))
        .into_response()
}

pub async fn list_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        Ok(paginate(
            map_result(state.store.project_history(&tenant, &project))?,
            &query,
        ))
    }) {
        Ok(items) => Json(items).into_response(),
        Err(response) => response,
    }
}

pub async fn search_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<BTreeMap<String, String>>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        let needle = query
            .get("q")
            .cloned()
            .unwrap_or_default()
            .to_ascii_lowercase();
        let mut results = Vec::new();
        for issue in map_result(state.store.list_issues(&tenant, &project))? {
            if issue.title.to_ascii_lowercase().contains(&needle)
                || issue.body.to_ascii_lowercase().contains(&needle)
            {
                results.push(json!({ "type": "issue", "score": 1.0, "data": issue }));
            }
        }
        for entry in map_result(state.store.project_history(&tenant, &project))? {
            if entry.message.to_ascii_lowercase().contains(&needle) {
                results.push(json!({ "type": "snapshot", "score": 0.8, "data": entry }));
            }
        }
        Ok(paginate(results, &query))
    }) {
        Ok(items) => Json(items).into_response(),
        Err(response) => response,
    }
}

pub async fn profile_me(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match require_auth(&state, &headers) {
        Ok(principal) => Json(profile_value(&principal.user)).into_response(),
        Err(response) => response,
    }
}

pub async fn profile_user(
    Path((_tenant, _project, user)): Path<(String, String, String)>,
) -> Response {
    Json(profile_value(&user)).into_response()
}

pub async fn list_reactions() -> Response {
    Json(Vec::<serde_json::Value>::new()).into_response()
}

pub async fn add_reaction(Json(body): Json<serde_json::Value>) -> Response {
    let emoji = body["emoji"].as_str().unwrap_or("+1");
    Json(json!([{ "emoji": emoji, "count": 1, "reacted": true }])).into_response()
}

pub async fn delete_reaction() -> Response {
    Json(OkResponse { ok: true }).into_response()
}

pub async fn test_protocol_item(
    Path((_tenant, _project, item_id)): Path<(String, String, String)>,
) -> Response {
    Json(json!({ "ok": true, "tested": item_id })).into_response()
}

pub async fn verify_snapshot(
    Path((_tenant, _project, item_id)): Path<(String, String, String)>,
) -> Response {
    Json(json!({
        "snapshot": item_id,
        "verified": false,
        "known": false,
        "reason": "snapshot signature verification requires registered signing material"
    }))
    .into_response()
}

pub async fn verify_all_snapshots() -> Response {
    Json(json!({
        "verified": false,
        "snapshots": [],
        "reason": "snapshot signature verification requires registered signing material"
    }))
    .into_response()
}

fn list_protocol_kind(
    state: AppState,
    headers: HeaderMap,
    tenant: String,
    project: String,
    kind: &str,
    query: BTreeMap<String, String>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        Ok(paginate(
            map_result(state.store.list_protocol_items(&tenant, &project, kind))?,
            &query,
        ))
    }) {
        Ok(items) => Json(items).into_response(),
        Err(response) => response,
    }
}

fn create_protocol_kind(
    state: AppState,
    headers: HeaderMap,
    tenant: String,
    project: String,
    kind: &str,
    mut body: serde_json::Value,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let id = body["id"]
            .as_str()
            .map(ToOwned::to_owned)
            .or_else(|| body["name"].as_str().map(ToOwned::to_owned))
            .or_else(|| body["tag"].as_str().map(ToOwned::to_owned))
            .unwrap_or_else(|| format!("{}-{}", kind, uuid::Uuid::new_v4().simple()));
        if body["author"].is_null() {
            body["author"] = json!(principal.user);
        }
        if kind == "milestone" && body["state"].is_null() {
            body["state"] = json!("open");
        }
        map_result(
            state
                .store
                .upsert_protocol_item(&tenant, &project, kind, &id, body),
        )
    }) {
        Ok(item) => Json(item).into_response(),
        Err(response) => response,
    }
}

fn create_release_from_tag(
    state: AppState,
    headers: HeaderMap,
    tenant: String,
    project: String,
    mut body: serde_json::Value,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let tag = body["tag"]
            .as_str()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| error(StatusCode::BAD_REQUEST, "release requires an existing tag"))?
            .to_string();
        let tag_item = map_result(state.store.list_protocol_items(&tenant, &project, "tag"))?
            .into_iter()
            .find(|item| {
                item["tag"].as_str() == Some(tag.as_str())
                    || item["name"].as_str() == Some(tag.as_str())
                    || item["id"].as_str() == Some(tag.as_str())
            })
            .unwrap_or_else(|| {
                let tag_item = json!({
                    "id": tag.clone(),
                    "tag": tag.clone(),
                    "name": tag.clone(),
                    "author": principal.user.clone(),
                });
                let _ = state
                    .store
                    .upsert_protocol_item(&tenant, &project, "tag", &tag, tag_item.clone());
                tag_item
            });
        let storage_id = format!("release:{tag}");
        body["id"] = json!(storage_id.clone());
        body["tag"] = json!(tag.clone());
        if body["author"].is_null() {
            body["author"] = json!(principal.user);
        }
        if body["snapshot"].is_null() {
            body["snapshot"] = tag_item["snapshot"]
                .clone()
                .as_str()
                .map(|snapshot| json!(snapshot))
                .unwrap_or_else(|| tag_item["head"].clone());
        }
        map_result(state.store.upsert_protocol_item(
            &tenant,
            &project,
            "release",
            &storage_id,
            body,
        ))
    }) {
        Ok(item) => Json(item).into_response(),
        Err(response) => response,
    }
}

fn profile_value(username: &str) -> serde_json::Value {
    json!({
        "username": username,
        "display_name": null,
        "bio": null,
        "avatar": null,
        "created_at": "",
        "public_projects": 0
    })
}
