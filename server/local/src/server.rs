use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Result;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde_json::json;
use tower_http::cors::CorsLayer;

use crate::auth::verify_ave_id_token;
use crate::catalog::Catalog;
use crate::store::{ObjectStore, Store};
use sty_store::Store as _;
use sty_protocol::{
    ChunkCompleteRequest, CompareRequest, CompareResponse, CreateIssueRequest, CreateOrgRequest,
    DevTokenRequest, DownloadRequest, DownloadResponse, HeadResponse, HeadUpdateRequest,
    HistoryResponse, IssuesResponse, LogHistoryRequest, MeResponse, MissingRequest, MissingResponse,
    OkResponse, ProjectDetailResponse, ProjectSummary, SessionExchangeRequest, StarResponse,
    TokenPrincipal, TokenResponse, UpdateSettingsRequest, UploadRequest, WorkspaceStateResponse,
    WorkspaceSummary,
};

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
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/head",
            get(get_head).put(update_head),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/history",
            get(workspace_history).post(log_history),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/ready",
            post(mark_ready),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/merge",
            post(merge_workspace_handler),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/parent",
            post(set_parent),
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
            "/v1/tenants/{tenant}/projects/{project}/objects/upload",
            post(upload),
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
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::OPTIONS])
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
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
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
                    owner: principal.user,
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
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let head = map_result(state.store.head(&tenant, &project, workspace))?;
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
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        let head = map_result(state.store.head(&tenant, &project, workspace))?;
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
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.store.list_issues(&tenant, &project))
    }) {
        Ok(issues) => Json(IssuesResponse { issues }).into_response(),
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
        map_result(state.store.create_issue(&tenant, &project, &principal, &body.title, &body.body))
    }) {
        Ok(issue) => Json(issue).into_response(),
        Err(response) => response,
    }
}

async fn list_workspace_states(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project)): Path<(String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
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
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
        map_result(state.store.workspace_history(&tenant, &project, &workspace))
    }) {
        Ok(entries) => Json(HistoryResponse { entries }).into_response(),
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
        map_result(state.store.mark_workspace_ready(&tenant, &project, &workspace, &principal))
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
        map_result(state.store.merge_workspace(&tenant, &project, &workspace, &principal))
    }) {
        Ok(()) => Json(OkResponse { ok: true }).into_response(),
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
        map_result(state.store.set_parent_workspace(&tenant, &project, &workspace, parent))
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
        map_result(state.store.project_settings(&tenant, &project))
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
        map_result(state.store.update_project_settings(&tenant, &project, visibility, default_workspace))
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
        Ok((is_starred, starred_count)) => Json(StarResponse { is_starred, starred_count }).into_response(),
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
        Ok((is_starred, starred_count)) => Json(StarResponse { is_starred, starred_count }).into_response(),
        Err(response) => response,
    }
}

async fn get_head(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tenant, project, workspace)): Path<(String, String, String)>,
) -> Response {
    match require_auth(&state, &headers).and_then(|principal| {
        map_store_result(state.store.ensure_project(&tenant, &project, &principal))?;
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

fn require_auth(
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

fn map_result<T>(value: Result<T>) -> std::result::Result<T, Response> {
    value.map_err(|err| error(StatusCode::BAD_REQUEST, err.to_string()))
}

fn map_store_result<T>(value: Result<T>) -> std::result::Result<T, Response> {
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

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(json!({ "error": message.into() }))).into_response()
}
