use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::json;
use sha2::{Digest, Sha256};
use sty_protocol::{
    ChunkCompleteRequest, CompareRequest, CompareResponse, DevTokenRequest, DownloadRequest,
    DownloadResponse, HeadResponse, HeadUpdateRequest, MissingRequest, MissingResponse,
    OkResponse, ProjectSummary, RemoteObject, SessionExchangeRequest, SnapshotObject,
    TokenResponse, UploadRequest, validate_segment,
};
use worker::*;

mod auth;
mod support;

use auth::{dev_tokens_enabled, verify_ave_id_token};
use support::{
    apply_cors, bucket, coordinator, decode_base64, ensure_project_access, head_key, json_error,
    mint_token, object_chunk_key, object_key, param, preflight_response, project_owner,
    project_params, put_bytes, put_text, required_header, required_usize_header, snapshot_key,
    token_key, validate_object, validate_object_metadata,
};

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    if req.method() == Method::Options {
        return preflight_response(&req);
    }
    let request = req.clone()?;
    let mut response = Router::new()
        .post_async("/v1/auth/check", auth_check)
        .post_async("/v1/dev/tokens", dev_token)
        .post_async("/v1/session/exchange", exchange_session)
        .get_async("/v1/projects", list_projects)
        .post_async("/v1/tenants/:tenant/projects/:project", create_project)
        .get_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/head",
            get_head,
        )
        .put_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/head",
            update_head,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/compare",
            compare,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/objects/missing",
            missing,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/objects/upload",
            upload,
        )
        .put_async(
            "/v1/tenants/:tenant/projects/:project/objects/:object/chunks/:chunk",
            upload_chunk,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/objects/:object/complete",
            complete_chunked_upload,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/objects/download",
            download,
        )
        .run(req, env)
        .await?;
    apply_cors(&request, &mut response)?;
    Ok(response)
}

async fn auth_check(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    Response::from_json(&json!({ "ok": true, "user": user }))
}

async fn dev_token(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    if !dev_tokens_enabled(&ctx.env) {
        return json_error(404, "not found");
    }
    let body: DevTokenRequest = req.json().await?;
    validate_segment(&body.user).map_err(|error| Error::RustError(error.to_string()))?;
    let token = mint_token("dev");
    put_text(&bucket(&ctx.env)?, &token_key(&token), &body.user).await?;
    Response::from_json(&TokenResponse { token })
}

async fn exchange_session(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let body: SessionExchangeRequest = req.json().await?;
    if body.id_token.trim().is_empty() {
        return json_error(400, "missing Ave id token");
    }
    let user = match verify_ave_id_token(&ctx.env, &body.id_token).await {
        Ok(user) => user,
        Err(error) => return json_error(401, &error.to_string()),
    };
    let token = mint_token("ave");
    put_text(&bucket(&ctx.env)?, &token_key(&token), &user).await?;
    Response::from_json(&TokenResponse { token })
}

async fn list_projects(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let objects = bucket(&ctx.env)?
        .list()
        .prefix("projects/")
        .execute()
        .await?;
    let mut projects = Vec::new();
    for object in objects.objects() {
        let key = object.key();
        if !key.ends_with("/project.json") {
            continue;
        }
        let parts = key.split('/').collect::<Vec<_>>();
        if parts.len() != 4 {
            continue;
        }
        let owner = project_owner(&bucket(&ctx.env)?, &key)
            .await?
            .unwrap_or_else(|| parts[1].to_string());
        if owner != user && parts[1] != user {
            continue;
        }
        projects.push(ProjectSummary {
            tenant: parts[1].to_string(),
            project: parts[2].to_string(),
            owner,
        });
    }
    Response::from_json(&json!({ "projects": projects }))
}

async fn create_project(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    if !ensure_project_access(&ctx.env, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    Response::from_json(&OkResponse { ok: true })
}

async fn get_head(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    if !ensure_project_access(&ctx.env, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let workspace = param(&ctx, "workspace")?;
    let coordinator = coordinator(&ctx.env, &tenant, &project)?;
    let response = coordinator
        .fetch_with_str(&format!("https://sty.local/head/{workspace}"))
        .await?;
    Ok(response)
}

async fn update_head(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    if !ensure_project_access(&ctx.env, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let workspace = param(&ctx, "workspace")?;
    let body: HeadUpdateRequest = req.json().await?;
    let coordinator = coordinator(&ctx.env, &tenant, &project)?;
    let mut init = RequestInit::new();
    init.with_method(Method::Put)
        .with_body(Some(serde_json::to_string(&body)?.into()));
    let request = Request::new_with_init(&format!("https://sty.local/head/{workspace}"), &init)?;
    coordinator.fetch_with_request(request).await
}

async fn compare(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    if !ensure_project_access(&ctx.env, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let workspace = param(&ctx, "workspace")?;
    let body: CompareRequest = req.json().await?;
    let coordinator = coordinator(&ctx.env, &tenant, &project)?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_body(Some(serde_json::to_string(&body)?.into()));
    let request = Request::new_with_init(&format!("https://sty.local/compare/{workspace}"), &init)?;
    coordinator.fetch_with_request(request).await
}

async fn missing(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    if !ensure_project_access(&ctx.env, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let body: MissingRequest = req.json().await?;
    let store = bucket(&ctx.env)?;
    let mut missing = Vec::new();
    for id in body.ids {
        let key = object_key(&tenant, &project, &id);
        if store.head(key).await?.is_none() {
            missing.push(id);
        }
    }
    Response::from_json(&MissingResponse { missing })
}

async fn upload(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    if !ensure_project_access(&ctx.env, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let body: UploadRequest = req.json().await?;
    let store = bucket(&ctx.env)?;
    for object in body.objects {
        validate_object(&object)?;
        let bytes = decode_base64(&object.bytes_base64)?;
        put_bytes(&store, &object_key(&tenant, &project, &object.id), bytes).await?;
        put_text(
            &store,
            &format!("{}.kind", object_key(&tenant, &project, &object.id)),
            &object.kind,
        )
        .await?;
        if object.kind == "snapshot" {
            index_snapshot(&ctx.env, &tenant, &project, object).await?;
        }
    }
    Response::from_json(&OkResponse { ok: true })
}

async fn upload_chunk(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    if !ensure_project_access(&ctx.env, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let id = param(&ctx, "object")?;
    let chunk_index = param(&ctx, "chunk")?
        .parse::<usize>()
        .map_err(|_| Error::RustError("invalid chunk index".to_string()))?;
    let kind = required_header(&req, "x-pig-object-kind")?;
    let chunk_count = required_usize_header(&req, "x-pig-chunk-count")?;
    let total_size = required_usize_header(&req, "x-pig-total-size")?;
    validate_object_metadata(&id, &kind)?;
    if chunk_count == 0 || chunk_index >= chunk_count || total_size == 0 {
        return json_error(400, "invalid chunk metadata");
    }
    let store = bucket(&ctx.env)?;
    if store.head(object_key(&tenant, &project, &id)).await?.is_some() {
        return Response::from_json(&OkResponse { ok: true });
    }
    let bytes = req.bytes().await?;
    put_bytes(
        &store,
        &object_chunk_key(&tenant, &project, &id, chunk_index),
        bytes,
    )
    .await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn complete_chunked_upload(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    if !ensure_project_access(&ctx.env, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let id = param(&ctx, "object")?;
    let body: ChunkCompleteRequest = req.json().await?;
    validate_object_metadata(&id, &body.kind)?;
    if body.chunk_count == 0 {
        return json_error(400, "chunk_count must be greater than zero");
    }
    let store = bucket(&ctx.env)?;
    let key = object_key(&tenant, &project, &id);
    if store.head(key.clone()).await?.is_some() {
        return Response::from_json(&OkResponse { ok: true });
    }
    let mut bytes = Vec::with_capacity(body.total_size);
    for chunk_index in 0..body.chunk_count {
        let chunk_key = object_chunk_key(&tenant, &project, &id, chunk_index);
        let Some(object) = store.get(chunk_key).execute().await? else {
            return json_error(400, &format!("missing chunk {chunk_index} for object {id}"));
        };
        let Some(chunk_body) = object.body() else {
            return json_error(400, &format!("missing chunk body {chunk_index} for object {id}"));
        };
        bytes.extend(chunk_body.bytes().await?);
    }
    if bytes.len() != body.total_size {
        return json_error(400, "chunked object size does not match declared total size");
    }
    let digest = hex::encode(Sha256::digest(&bytes));
    if digest != id {
        return json_error(400, "object id does not match SHA-256 digest");
    }
    let snapshot = if body.kind == "snapshot" {
        Some(serde_json::from_slice::<SnapshotObject>(&bytes)?)
    } else {
        None
    };
    put_bytes(&store, &key, bytes).await?;
    put_text(&store, &format!("{key}.kind"), &body.kind).await?;
    if let Some(snapshot) = snapshot {
        let coordinator = coordinator(&ctx.env, &tenant, &project)?;
        let body = json!({ "id": id, "parents": snapshot.parents });
        let mut init = RequestInit::new();
        init.with_method(Method::Post)
            .with_body(Some(body.to_string().into()));
        let request = Request::new_with_init("https://sty.local/snapshots", &init)?;
        let _ = coordinator.fetch_with_request(request).await?;
    }
    for chunk_index in 0..body.chunk_count {
        store
            .delete(object_chunk_key(&tenant, &project, &id, chunk_index))
            .await?;
    }
    Response::from_json(&OkResponse { ok: true })
}

async fn download(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    if !ensure_project_access(&ctx.env, &tenant, &project, &user).await? {
        return json_error(403, "project access denied");
    }
    let body: DownloadRequest = req.json().await?;
    let store = bucket(&ctx.env)?;
    let mut objects = Vec::new();
    for id in body.ids {
        let key = object_key(&tenant, &project, &id);
        let Some(object) = store.get(key.clone()).execute().await? else {
            continue;
        };
        let Some(body) = object.body() else {
            continue;
        };
        let bytes = body.bytes().await?;
        let Some(kind_object) = store.get(format!("{key}.kind")).execute().await? else {
            continue;
        };
        let Some(kind_body) = kind_object.body() else {
            continue;
        };
        objects.push(RemoteObject {
            id,
            kind: kind_body.text().await?,
            bytes_base64: BASE64.encode(bytes),
        });
    }
    Response::from_json(&DownloadResponse { objects })
}

async fn index_snapshot(
    env: &Env,
    tenant: &str,
    project: &str,
    object: RemoteObject,
) -> Result<()> {
    let bytes = decode_base64(&object.bytes_base64)?;
    let snapshot: SnapshotObject = serde_json::from_slice(&bytes)?;
    let coordinator = coordinator(env, tenant, project)?;
    let body = json!({ "id": object.id, "parents": snapshot.parents });
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_body(Some(body.to_string().into()));
    let request = Request::new_with_init("https://sty.local/snapshots", &init)?;
    let _ = coordinator.fetch_with_request(request).await?;
    Ok(())
}

#[durable_object]
pub struct ProjectCoordinator {
    state: State,
}

impl DurableObject for ProjectCoordinator {
    fn new(state: State, _env: Env) -> Self {
        Self { state }
    }

    async fn fetch(&self, mut req: Request) -> Result<Response> {
        let url = req.url()?;
        let path = url.path();
        if let Some(workspace) = path.strip_prefix("/head/") {
            if req.method() == Method::Get {
                let head: Option<String> = self.state.storage().get(&head_key(workspace)).await?;
                return Response::from_json(&HeadResponse { head });
            }
            let body: HeadUpdateRequest = req.json().await?;
            let key = head_key(workspace);
            let current: Option<String> = self.state.storage().get(&key).await?;
            if current.as_deref() != body.expected_head.as_deref() {
                return json_error(409, "workspace head changed");
            }
            self.state.storage().put(&key, body.new_head).await?;
            return Response::from_json(&OkResponse { ok: true });
        }
        if let Some(workspace) = path.strip_prefix("/compare/") {
            let body: CompareRequest = req.json().await?;
            let remote_head: Option<String> =
                self.state.storage().get(&head_key(workspace)).await?;
            let relation = compare_relation(
                &self.state,
                body.local_head.as_deref(),
                remote_head.as_deref(),
            )
            .await?;
            return Response::from_json(&CompareResponse {
                remote_head,
                relation,
            });
        }
        if path == "/snapshots" {
            let body: serde_json::Value = req.json().await?;
            let id = body["id"].as_str().unwrap_or_default();
            let parents = body["parents"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|value| value.as_str().map(ToOwned::to_owned))
                .collect::<Vec<_>>();
            self.state.storage().put(&snapshot_key(id), parents).await?;
            return Response::from_json(&OkResponse { ok: true });
        }
        json_error(404, "not found")
    }
}

async fn compare_relation(
    state: &State,
    local_head: Option<&str>,
    remote_head: Option<&str>,
) -> Result<String> {
    let relation = match (local_head, remote_head) {
        (_, None) => "remote_missing",
        (Some(local), Some(remote)) if local == remote => "same",
        (None, Some(_)) => "remote_ahead",
        (Some(local), Some(remote)) if is_ancestor(state, remote, local).await? => "local_ahead",
        (Some(local), Some(remote)) if is_ancestor(state, local, remote).await? => "remote_ahead",
        (Some(local), Some(_))
            if state
                .storage()
                .get::<Vec<String>>(&snapshot_key(local))
                .await?
                .is_none() =>
        {
            "local_ahead"
        }
        _ => "diverged",
    };
    Ok(relation.to_string())
}

async fn is_ancestor(state: &State, ancestor: &str, head: &str) -> Result<bool> {
    let mut seen = Vec::<String>::new();
    let mut stack = vec![head.to_string()];
    while let Some(id) = stack.pop() {
        if id == ancestor {
            return Ok(true);
        }
        if seen.contains(&id) {
            continue;
        }
        seen.push(id.clone());
        if let Some(parents) = state
            .storage()
            .get::<Vec<String>>(&snapshot_key(&id))
            .await?
        {
            stack.extend(parents);
        }
    }
    Ok(false)
}

async fn require_auth(req: &Request, env: &Env) -> Result<String> {
    let Some(value) = req.headers().get("authorization")? else {
        return Err(Error::RustError("missing bearer token".to_string()));
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Err(Error::RustError("missing bearer token".to_string()));
    };
    let Some(object) = bucket(env)?.get(token_key(token)).execute().await? else {
        return Err(Error::RustError("invalid bearer token".to_string()));
    };
    let Some(body) = object.body() else {
        return Err(Error::RustError("invalid bearer token".to_string()));
    };
    body.text().await
}
