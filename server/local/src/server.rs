use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Result;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde_json::json;
use tower_http::cors::CorsLayer;

use crate::auth::verify_ave_id_token;
use crate::catalog::Catalog;
use crate::protocol::*;
use crate::store::{ObjectStore, Store};
use sty_protocol::{
    ChunkCompleteRequest, CommentsResponse, CompareRequest, CompareResponse, CreateCommentRequest,
    CreateIssueRequest, CreateOrgRequest, DevTokenRequest, DownloadRequest, DownloadResponse,
    HeadResponse, HeadUpdateRequest, HistoryResponse, LogHistoryRequest, MeResponse,
    MissingRequest, MissingResponse, OkResponse, ProjectDetailResponse, ProjectSummary,
    SessionExchangeRequest, StarResponse, TokenPrincipal, TokenResponse, UpdateIssueRequest,
    UpdateSettingsRequest, UploadRequest, WorkspaceStateResponse, WorkspaceSummary,
};
use sty_store::Store as _;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub objects: Arc<ObjectStore>,
}

pub async fn run(bind: SocketAddr, store: Store, objects: ObjectStore) -> Result<()> {
    let app = router(Arc::new(store), Arc::new(objects));
    let listener = tokio::net::TcpListener::bind(bind).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

pub fn router(store: Arc<Store>, objects: Arc<ObjectStore>) -> Router {
    Router::new()
        .route("/v1/auth/check", post(auth_check))
        .route("/v1/capabilities", get(capabilities))
        .route("/v1/dev/tokens", post(create_dev_token))
        .route("/v1/session/exchange", post(exchange_session))
        .route("/v1/me", get(me))
        .route("/v1/orgs", post(create_org))
        .route("/v1/projects", get(list_projects))
        .route(
            "/v1/tenants/{tenant}/projects/{project}",
            get(project_detail).post(create_project),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces",
            get(list_workspace_states),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/tree",
            get(project_tree),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/files/{*path}",
            get(project_file),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/issues",
            get(project_issues).post(create_issue),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/issues/{issue_id}",
            get(get_issue).patch(update_issue),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/issues/{issue_id}/close",
            post(close_issue),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/issues/{issue_id}/reopen",
            post(reopen_issue),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/issues/{issue_id}/assignees",
            post(assign_issue),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/issues/{issue_id}/labels",
            post(label_issue),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/issues/{issue_id}/comments",
            get(issue_comments).post(create_comment_handler),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/labels",
            get(list_labels).post(create_label),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/labels/{item_id}",
            delete(delete_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/milestones",
            get(list_milestones).post(create_milestone),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/milestones/{item_id}",
            get(get_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/milestones/{item_id}/close",
            post(close_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/ready",
            get(list_ready),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/ready/{workspace}",
            get(get_ready),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/comments",
            get(list_protocol_comments).post(create_protocol_comment),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/comments/{item_id}",
            delete(delete_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/comments/{item_id}/reactions",
            get(list_reactions).post(add_reaction),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/comments/{item_id}/reactions/{reaction}",
            delete(delete_reaction),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/issues/{issue_id}/reactions",
            get(list_reactions).post(add_reaction),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/issues/{issue_id}/reactions/{reaction}",
            delete(delete_reaction),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/head",
            get(get_head).put(update_head),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/history",
            get(workspace_history).post(log_history),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/history",
            get(project_history),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/history/{entry_id}",
            get(history_entry),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/ready",
            post(mark_ready).delete(unmark_ready),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/merge",
            post(merge_workspace_handler),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/reject",
            post(reject_ready),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/hooks",
            get(list_hooks).post(create_hook),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/hooks/{item_id}",
            delete(delete_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/hooks/{item_id}/test",
            post(test_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/webhooks",
            get(list_webhooks).post(create_webhook),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/webhooks/{item_id}",
            delete(delete_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/webhooks/{item_id}/test",
            post(test_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/search",
            get(search_project),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/releases",
            get(list_releases).post(create_release),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/releases/{item_id}",
            get(get_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/keys",
            get(list_keys).post(create_key),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/keys/{item_id}",
            delete(delete_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/snapshots/verify",
            get(verify_all_snapshots),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/snapshots/{item_id}/verify",
            get(verify_snapshot),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/audit",
            get(list_audit),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/users/me",
            get(profile_me),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/users/{item_id}",
            get(profile_user),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/ssh-keys",
            get(list_ssh_keys).post(create_ssh_key),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/ssh-keys/{item_id}",
            delete(delete_protocol_item),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/parent",
            post(set_parent),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/merge-preview",
            get(merge_preview),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/compare",
            post(compare),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/settings",
            get(get_settings).patch(update_settings),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/star",
            post(star_project_handler).delete(unstar_project_handler),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/objects/missing",
            post(missing),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/objects/check",
            post(missing),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/objects/upload",
            post(upload),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/objects",
            post(upload),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/objects/{object}",
            get(get_object),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/objects/{object}/chunks/{chunk}",
            put(upload_chunk),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/objects/{object}/complete",
            post(complete_chunked_upload),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/objects/download",
            post(download),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/tags",
            get(list_tags).post(create_tag),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/tags/{item_id}",
            get(get_protocol_item),
        )
        .layer(cors_layer())
        .with_state(AppState { store, objects })
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:5173"),
            HeaderValue::from_static("http://127.0.0.1:5173"),
            HeaderValue::from_static("http://localhost:4173"),
            HeaderValue::from_static("http://127.0.0.1:4173"),
        ])
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            HeaderName::from_static("x-pig-object-kind"),
            HeaderName::from_static("x-pig-chunk-count"),
            HeaderName::from_static("x-pig-total-size"),
        ])
}

async fn create_dev_token(
    State(state): State<AppState>,
    Json(body): Json<DevTokenRequest>,
) -> Response {
    match map_result(state.store.add_token(&body.user)) {
        Ok(token) => Json(TokenResponse { token }).into_response(),
        Err(response) => response,
    }
}

async fn auth_check(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match require_auth(&state, &headers) {
        Ok(principal) => Json(json!({ "ok": true, "user": principal.user })).into_response(),
        Err(response) => response,
    }
}

async fn capabilities(headers: HeaderMap) -> Response {
    let _ = headers;
    Json(sty_protocol::protocol_capabilities()).into_response()
}

async fn me(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_result(state.store.tenants(&principal)).map(|tenants| MeResponse {
            user: principal.user,
            tenants,
        })
    }) {
        Ok(body) => Json(body).into_response(),
        Err(response) => response,
    }
}

async fn create_org(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateOrgRequest>,
) -> Response {
    match require_auth(&state, &headers)
        .and_then(|principal| map_store_result(state.store.create_org(&body.name, &principal)))
    {
        Ok(tenant) => Json(tenant).into_response(),
        Err(response) => response,
    }
}

async fn exchange_session(
    State(state): State<AppState>,
    Json(body): Json<SessionExchangeRequest>,
) -> Response {
    if body.id_token.trim().is_empty() {
        return error(StatusCode::BAD_REQUEST, "missing Ave id token");
    }
    let user = match verify_ave_id_token(&body.id_token).await {
        Ok(user) => user,
        Err(err) => return error(StatusCode::UNAUTHORIZED, err.to_string()),
    };
    match map_result(state.store.add_token(&user)) {
        Ok(token) => Json(TokenResponse { token }).into_response(),
        Err(response) => response,
    }
}

async fn list_projects(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match require_auth(&state, &headers)
        .and_then(|principal| map_result(state.store.projects(&principal)))
    {
        Ok(projects) => Json(serde_json::json!({ "projects": projects })).into_response(),
        Err(response) => response,
    }
}

async fn create_project(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

async fn project_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        let owner = match map_result(state.store.get_project(&tenant, &project)) {
            Ok(Some(p)) => p.owner,
            Ok(None) => return Err(error(StatusCode::NOT_FOUND, "project not found")),
            Err(response) => return Err(response),
        };
        map_result(state.store.workspace_states(&tenant, &project)).map(|states| {
            let workspaces: Vec<WorkspaceSummary> = states
                .into_iter()
                .map(|s| WorkspaceSummary {
                    name: s.name,
                    head: s.head,
                })
                .collect();
            ProjectDetailResponse {
                project: ProjectSummary {
                    tenant: tenant.clone(),
                    project: project.clone(),
                    owner,
                },
                workspaces,
            }
        })
    }) {
        Ok(body) => Json(body).into_response(),
        Err(response) => response,
    }
}

async fn project_tree(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<std::collections::BTreeMap<String, String>>,
) -> Response {
    let workspace = query.get("workspace").map_or("main", String::as_str);
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        let head = if let Some(snapshot) = query.get("snapshot") {
            Some(snapshot.clone())
        } else {
            map_result(state.store.head(&tenant, &project, workspace))?
        };
        map_result(Catalog::new(state.store.root()).tree(&tenant, &project, workspace, head))
    }) {
        Ok(tree) => Json(tree).into_response(),
        Err(response) => response,
    }
}

async fn project_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, path)): Path<(String, String, String)>,
    axum::extract::Query(query): axum::extract::Query<std::collections::BTreeMap<String, String>>,
) -> Response {
    let workspace = query.get("workspace").map_or("main", String::as_str);
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        let head = if let Some(snapshot) = query.get("snapshot") {
            Some(snapshot.clone())
        } else {
            map_result(state.store.head(&tenant, &project, workspace))?
        };
        map_result(Catalog::new(state.store.root()).file(&tenant, &project, &path, head))
    }) {
        Ok(file) => Json(file).into_response(),
        Err(response) => response,
    }
}

async fn project_issues(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    axum::extract::Query(query): axum::extract::Query<std::collections::BTreeMap<String, String>>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        let mut issues = map_result(state.store.list_issues(&tenant, &project))?;
        if let Some(filter) = query.get("state") {
            issues.retain(|issue| issue.state == *filter || issue.status == *filter);
        }
        Ok(paginate(issues, &query))
    }) {
        Ok(issues) => Json(issues).into_response(),
        Err(response) => response,
    }
}

async fn create_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<CreateIssueRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.store.create_issue(
            &tenant,
            &project,
            &principal,
            &body.title,
            &body.body,
            &body.labels,
            body.assignee.as_deref(),
        ))
    }) {
        Ok(issue) => Json(issue).into_response(),
        Err(response) => response,
    }
}

async fn get_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, issue_id)): Path<(String, String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        let issue = map_result(state.store.list_issues(&tenant, &project))?
            .into_iter()
            .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id);
        issue.ok_or_else(|| error(StatusCode::NOT_FOUND, "issue not found"))
    }) {
        Ok(issue) => Json(issue).into_response(),
        Err(response) => response,
    }
}

async fn update_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, issue_id)): Path<(String, String, String)>,
    Json(body): Json<UpdateIssueRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(
            state.store.update_issue_status(
                &tenant,
                &project,
                &issue_id,
                body.state
                    .as_deref()
                    .or(body.status.as_deref())
                    .unwrap_or("open"),
            ),
        )
    }) {
        Ok(issue) => Json(issue).into_response(),
        Err(response) => response,
    }
}

async fn close_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, issue_id)): Path<(String, String, String)>,
) -> Response {
    set_issue_state(state, headers, tenant, project, issue_id, "closed").await
}

async fn reopen_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, issue_id)): Path<(String, String, String)>,
) -> Response {
    set_issue_state(state, headers, tenant, project, issue_id, "open").await
}

async fn set_issue_state(
    state: AppState,
    headers: HeaderMap,
    tenant: String,
    project: String,
    issue_id: String,
    status: &str,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(
            state
                .store
                .update_issue_status(&tenant, &project, &issue_id, status),
        )
    }) {
        Ok(issue) => Json(issue).into_response(),
        Err(response) => response,
    }
}

async fn assign_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, issue_id)): Path<(String, String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let assignees = issue_string_list(&body, "assignees", "user");
        map_result(
            state
                .store
                .add_issue_assignees(&tenant, &project, &issue_id, &assignees),
        )
    }) {
        Ok(issue) => Json(issue).into_response(),
        Err(response) => response,
    }
}

async fn label_issue(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, issue_id)): Path<(String, String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let labels = issue_string_list(&body, "labels", "label");
        map_result(
            state
                .store
                .add_issue_labels(&tenant, &project, &issue_id, &labels),
        )
    }) {
        Ok(issue) => Json(issue).into_response(),
        Err(response) => response,
    }
}

fn issue_string_list(body: &serde_json::Value, list_key: &str, single_key: &str) -> Vec<String> {
    body[list_key]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                .collect()
        })
        .or_else(|| {
            body["users"].as_array().map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                    .collect()
            })
        })
        .or_else(|| body[single_key].as_str().map(|item| vec![item.to_string()]))
        .unwrap_or_default()
}

async fn issue_comments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, issue_id)): Path<(String, String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        map_result(state.store.list_comments(&tenant, &project, &issue_id))
    }) {
        Ok(comments) => Json(CommentsResponse { comments }).into_response(),
        Err(response) => response,
    }
}

async fn create_comment_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, issue_id)): Path<(String, String, String)>,
    Json(body): Json<CreateCommentRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(
            state
                .store
                .create_comment(&tenant, &project, &issue_id, &principal, &body.body),
        )
    }) {
        Ok(comment) => Json(comment).into_response(),
        Err(response) => response,
    }
}

async fn list_workspace_states(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        map_result(state.store.workspace_states(&tenant, &project))
    }) {
        Ok(workspaces) => Json(WorkspaceStateResponse { workspaces }).into_response(),
        Err(response) => response,
    }
}

async fn workspace_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        map_result(state.store.workspace_history(&tenant, &project, &workspace))
    }) {
        Ok(entries) => Json(HistoryResponse { entries }).into_response(),
        Err(response) => response,
    }
}

async fn project_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        map_result(state.store.project_history(&tenant, &project))
    }) {
        Ok(entries) => Json(HistoryResponse { entries }).into_response(),
        Err(response) => response,
    }
}

async fn history_entry(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, entry_id)): Path<(String, String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        map_result(state.store.get_history_entry(&tenant, &project, &entry_id))
    }) {
        Ok(Some(entry)) => Json(entry).into_response(),
        Ok(None) => error(StatusCode::NOT_FOUND, "history entry not found"),
        Err(response) => response,
    }
}

async fn log_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
    Json(body): Json<LogHistoryRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.store.log_history(
            &tenant,
            &project,
            &workspace,
            &principal,
            &body.kind,
            &body.message,
            body.snapshot_id.as_deref(),
        ))
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

async fn mark_ready(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(
            state
                .store
                .mark_workspace_ready(&tenant, &project, &workspace, &principal),
        )
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

async fn merge_workspace_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(
            state
                .store
                .merge_workspace(&tenant, &project, &workspace, &principal),
        )
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

async fn merge_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        let states = map_result(state.store.workspace_states(&tenant, &project))?;
        let ws = states
            .into_iter()
            .find(|s| s.name == workspace)
            .ok_or_else(|| error(StatusCode::NOT_FOUND, "workspace not found"))?;
        let parent = ws
            .parent_workspace
            .as_ref()
            .ok_or_else(|| error(StatusCode::BAD_REQUEST, "workspace has no parent"))?;
        let head = map_result(state.store.head(&tenant, &project, &workspace))?;
        let parent_head = map_result(state.store.head(&tenant, &project, parent))?;
        let catalog = Catalog::new(state.store.root());
        let current_tree = catalog.tree(&tenant, &project, &workspace, head).ok();
        let parent_tree = catalog.tree(&tenant, &project, parent, parent_head).ok();
        let current_map: std::collections::HashMap<String, String> = current_tree
            .map(|t| {
                t.entries
                    .into_iter()
                    .filter(|e| e.entry_type == "blob")
                    .map(|e| (e.path, e.id))
                    .collect()
            })
            .unwrap_or_default();
        let parent_map: std::collections::HashMap<String, String> = parent_tree
            .map(|t| {
                t.entries
                    .into_iter()
                    .filter(|e| e.entry_type == "blob")
                    .map(|e| (e.path, e.id))
                    .collect()
            })
            .unwrap_or_default();
        let mut files = Vec::new();
        for (path, id) in &current_map {
            if !parent_map.contains_key(path) {
                files.push(sty_protocol::ChangedFile {
                    path: path.clone(),
                    change_type: "added".to_string(),
                    old_id: None,
                    new_id: Some(id.clone()),
                });
            } else if parent_map.get(path) != Some(id) {
                files.push(sty_protocol::ChangedFile {
                    path: path.clone(),
                    change_type: "modified".to_string(),
                    old_id: parent_map.get(path).cloned(),
                    new_id: Some(id.clone()),
                });
            }
        }
        for (path, id) in &parent_map {
            if !current_map.contains_key(path) {
                files.push(sty_protocol::ChangedFile {
                    path: path.clone(),
                    change_type: "deleted".to_string(),
                    old_id: Some(id.clone()),
                    new_id: None,
                });
            }
        }
        Ok(sty_protocol::MergePreviewResponse { files })
    }) {
        Ok(body) => Json(body).into_response(),
        Err(response) => response,
    }
}

async fn set_parent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let parent = body["parent_workspace"].as_str();
        map_result(
            state
                .store
                .set_parent_workspace(&tenant, &project, &workspace, parent),
        )
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.store.project_settings(&tenant, &project, &principal))
    }) {
        Ok(settings) => Json(settings).into_response(),
        Err(response) => response,
    }
}

async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<UpdateSettingsRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let visibility = body.visibility.as_deref().unwrap_or("private");
        let default_workspace = body.default_workspace.as_deref().unwrap_or("main");
        map_result(state.store.update_project_settings(
            &tenant,
            &project,
            &principal,
            visibility,
            default_workspace,
            body.navbar_items,
            body.panels,
        ))
    }) {
        Ok(settings) => Json(settings).into_response(),
        Err(response) => response,
    }
}

async fn star_project_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.store.star_project(&tenant, &project, &principal))
    }) {
        Ok((is_starred, starred_count)) => Json(StarResponse {
            is_starred,
            starred_count,
        })
        .into_response(),
        Err(response) => response,
    }
}

async fn unstar_project_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.store.unstar_project(&tenant, &project, &principal))
    }) {
        Ok((is_starred, starred_count)) => Json(StarResponse {
            is_starred,
            starred_count,
        })
        .into_response(),
        Err(response) => response,
    }
}

async fn get_head(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
) -> Response {
    match optional_auth(&state, &headers).and_then(|principal| {
        check_project_access(&state, &tenant, &project, principal.as_ref())?;
        map_result(state.store.head(&tenant, &project, &workspace))
    }) {
        Ok(head) => Json(HeadResponse { head }).into_response(),
        Err(response) => response,
    }
}

async fn compare(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
    Json(body): Json<CompareRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(
            state
                .store
                .compare(&tenant, &project, &workspace, body.local_head.as_deref()),
        )
    }) {
        Ok((remote_head, relation)) => Json(CompareResponse {
            remote_head,
            relation,
        })
        .into_response(),
        Err(response) => response,
    }
}

async fn missing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<MissingRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.objects.missing(&tenant, &project, &body.ids))
    }) {
        Ok(missing) => Json(MissingResponse { missing }).into_response(),
        Err(response) => response,
    }
}

async fn upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<UploadRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.objects.upload(&tenant, &project, &body.objects))
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

async fn upload_chunk(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, object, chunk)): Path<(String, String, String, usize)>,
    body: Bytes,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let kind = required_header(&headers, "x-pig-object-kind")?;
        let chunk_count = required_usize_header(&headers, "x-pig-chunk-count")?;
        let total_size = required_usize_header(&headers, "x-pig-total-size")?;
        map_result(state.objects.upload_chunk(
            &tenant,
            &project,
            &object,
            &kind,
            chunk,
            chunk_count,
            total_size,
            body.as_ref(),
        ))
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

async fn complete_chunked_upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, object)): Path<(String, String, String)>,
    Json(body): Json<ChunkCompleteRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.objects.complete_chunked_upload(
            &tenant,
            &project,
            &object,
            &body.kind,
            body.total_size,
            body.chunk_count,
        ))
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
        Err(response) => response,
    }
}

async fn download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
    Json(body): Json<DownloadRequest>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.objects.download(&tenant, &project, &body.ids))
    }) {
        Ok(objects) => Json(DownloadResponse { objects }).into_response(),
        Err(response) => response,
    }
}

async fn get_object(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, object)): Path<(String, String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let mut objects = map_result(state.objects.download(&tenant, &project, &[object]))?;
        objects
            .pop()
            .ok_or_else(|| error(StatusCode::NOT_FOUND, "object not found"))
    }) {
        Ok(object) => Json(object).into_response(),
        Err(response) => response,
    }
}

async fn update_head(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
    Json(body): Json<HeadUpdateRequest>,
) -> Response {
    let result = require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.store.update_head(
            &tenant,
            &project,
            &workspace,
            body.expected_head.as_deref(),
            &body.new_head,
        ))
    });
    match result {
        Ok(true) => Json(OkResponse { ok: true }).into_response(),
        Ok(false) => (
            StatusCode::CONFLICT,
            Json(json!({ "error": "workspace head changed" })),
        )
            .into_response(),
        Err(response) => response,
    }
}

pub(crate) fn require_auth(
    state: &AppState,
    headers: &HeaderMap,
) -> std::result::Result<TokenPrincipal, Response> {
    let Some(value) = headers.get("authorization") else {
        return Err(error(StatusCode::UNAUTHORIZED, "missing bearer token"));
    };
    let Ok(value) = value.to_str() else {
        return Err(error(
            StatusCode::UNAUTHORIZED,
            "invalid authorization header",
        ));
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Err(error(StatusCode::UNAUTHORIZED, "missing bearer token"));
    };
    match state.store.principal_for_token(token) {
        Ok(Some(principal)) => Ok(principal),
        Ok(None) => Err(error(StatusCode::FORBIDDEN, "invalid bearer token")),
        Err(err) => Err(error(StatusCode::INTERNAL_SERVER_ERROR, err.to_string())),
    }
}

pub(crate) fn optional_auth(
    state: &AppState,
    headers: &HeaderMap,
) -> std::result::Result<Option<TokenPrincipal>, Response> {
    let Some(value) = headers.get("authorization") else {
        return Ok(None);
    };
    let Ok(value) = value.to_str() else {
        return Err(error(
            StatusCode::UNAUTHORIZED,
            "invalid authorization header",
        ));
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Ok(None);
    };
    match state.store.principal_for_token(token) {
        Ok(Some(principal)) => Ok(Some(principal)),
        Ok(None) => Err(error(StatusCode::FORBIDDEN, "invalid bearer token")),
        Err(err) => Err(error(StatusCode::INTERNAL_SERVER_ERROR, err.to_string())),
    }
}

pub(crate) fn map_result<T>(value: Result<T>) -> std::result::Result<T, Response> {
    value.map_err(|err| error(StatusCode::BAD_REQUEST, err.to_string()))
}

pub(crate) fn map_store_result<T>(value: Result<T>) -> std::result::Result<T, Response> {
    value.map_err(|err| {
        let message = err.to_string();
        let status = if message.contains("cannot access") || message.contains("cannot create") {
            StatusCode::FORBIDDEN
        } else {
            StatusCode::BAD_REQUEST
        };
        error(status, message)
    })
}

pub(crate) fn check_project_access(
    state: &AppState,
    tenant: &str,
    project: &str,
    principal: Option<&TokenPrincipal>,
) -> std::result::Result<(), Response> {
    if let Some(p) = principal {
        map_store_result(state.store.ensure_project(tenant, project, p))?;
        Ok(())
    } else {
        match map_result(state.store.project_visibility(tenant, project)) {
            Ok(Some(v)) if v == "public" => Ok(()),
            Ok(_) => Err(error(StatusCode::UNAUTHORIZED, "sign in required")),
            Err(response) => Err(response),
        }
    }
}

fn required_header(headers: &HeaderMap, name: &str) -> std::result::Result<String, Response> {
    let Some(value) = headers.get(name) else {
        return Err(error(
            StatusCode::BAD_REQUEST,
            format!("missing {name} header"),
        ));
    };
    value
        .to_str()
        .map(|value| value.to_string())
        .map_err(|_| error(StatusCode::BAD_REQUEST, format!("invalid {name} header")))
}

fn required_usize_header(headers: &HeaderMap, name: &str) -> std::result::Result<usize, Response> {
    required_header(headers, name)?
        .parse()
        .map_err(|_| error(StatusCode::BAD_REQUEST, format!("invalid {name} header")))
}

pub(crate) fn paginate<T: serde::Serialize>(
    items: Vec<T>,
    query: &std::collections::BTreeMap<String, String>,
) -> sty_protocol::Paginated<T> {
    if query.get("all").is_some_and(|value| value == "true") {
        return sty_protocol::Paginated {
            page: 1,
            per_page: items.len().max(1),
            total: items.len(),
            total_pages: 1,
            next: None,
            prev: None,
            items,
        };
    }
    let page = query
        .get("page")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(1)
        .max(1);
    let per_page = query
        .get("per_page")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(25)
        .clamp(1, 100);
    let total = items.len();
    let total_pages = total.div_ceil(per_page).max(1);
    let start = (page - 1).saturating_mul(per_page);
    sty_protocol::Paginated {
        items: items.into_iter().skip(start).take(per_page).collect(),
        page,
        per_page,
        total,
        total_pages,
        next: (page < total_pages).then_some(page + 1),
        prev: (page > 1).then_some(page - 1),
    }
}

pub(crate) fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(json!({ "error": message.into() }))).into_response()
}
