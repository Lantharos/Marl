use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Result;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;

use crate::auth::verify_ave_id_token;
use crate::store::Store;
use sty_protocol::{
    CompareRequest, CompareResponse, DevTokenRequest, DownloadRequest, DownloadResponse,
    HeadResponse, HeadUpdateRequest, MissingRequest, MissingResponse, OkResponse,
    SessionExchangeRequest, TokenPrincipal, TokenResponse, UploadRequest,
};

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
}

pub async fn run(bind: SocketAddr, store: Store) -> Result<()> {
    let app = router(Arc::new(store));
    let listener = tokio::net::TcpListener::bind(bind).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

pub fn router(store: Arc<Store>) -> Router {
    Router::new()
        .route("/v1/auth/check", post(auth_check))
        .route("/v1/dev/tokens", post(create_dev_token))
        .route("/v1/session/exchange", post(exchange_session))
        .route("/v1/projects", get(list_projects))
        .route(
            "/v1/tenants/{tenant}/projects/{project}",
            post(create_project),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/head",
            get(get_head).put(update_head),
        )
        .route(
            "/v1/tenants/{tenant}/projects/{project}/workspaces/{workspace}/compare",
            post(compare),
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
            "/v1/tenants/{tenant}/projects/{project}/objects/download",
            post(download),
        )
        .with_state(AppState { store })
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
        map_result(state.store.missing(&tenant, &project, &body.ids))
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
        map_result(state.store.upload(&tenant, &project, &body.objects))
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
        map_result(state.store.download(&tenant, &project, &body.ids))
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

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(json!({ "error": message.into() }))).into_response()
}
