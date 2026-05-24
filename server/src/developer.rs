use serde::Deserialize;
use serde_json::json;
use sty_protocol::OkResponse;
use worker::*;

use crate::support::{db, json_error, paginate_vec, param, project_params};
use crate::{
    check_project_capability, check_project_write_capability, check_project_write_role, d1,
    require_auth,
};

#[path = "developer_webhook_routes.rs"]
mod developer_webhook_routes;
pub use developer_webhook_routes::*;

#[derive(Deserialize)]
struct ApiKeyRequest {
    name: String,
    #[serde(default)]
    scopes: Vec<String>,
    expires_at: Option<String>,
}

#[derive(Deserialize)]
struct WebhookRequest {
    name: String,
    url: String,
    #[serde(default)]
    events: Vec<String>,
}

#[derive(Deserialize)]
struct DeveloperAppRequest {
    name: String,
    redirect_uri: String,
    description: Option<String>,
    homepage_url: Option<String>,
}

#[derive(Deserialize)]
struct OAuthAuthorizeRequest {
    client_id: String,
    redirect_uri: String,
    tenant: String,
    project: String,
    scope: Option<String>,
    scopes: Option<Vec<String>>,
    state: Option<String>,
}

#[derive(Deserialize)]
struct OAuthTokenRequest {
    client_id: String,
    client_secret: String,
    code: String,
    redirect_uri: String,
    grant_type: Option<String>,
    #[serde(rename = "grantType")]
    grant_type_camel: Option<String>,
}

pub async fn list_project_api_keys(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "settings:read",
    )
    .await?;
    let items = d1::list_project_api_keys(&database, &tenant, &project).await?;
    Response::from_json(&paginate_vec(req.url()?, items))
}

pub async fn create_project_api_key(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: ApiKeyRequest = req.json().await?;
    let name = body.name.trim();
    if name.is_empty() {
        return json_error(400, "api key name is required");
    }
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "settings:write",
    )
    .await?;
    let item = d1::create_project_api_key(
        &database,
        &tenant,
        &project,
        &user,
        name,
        &body.scopes,
        body.expires_at.as_deref(),
    )
    .await?;
    Response::from_json(&item)
}

pub async fn delete_project_api_key(
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
        "settings:write",
    )
    .await?;
    if !d1::revoke_project_api_key(&database, &tenant, &project, &id).await? {
        return json_error(404, "api key not found");
    }
    Response::from_json(&OkResponse { ok: true })
}

pub async fn list_project_webhooks(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "webhooks:read",
    )
    .await?;
    let items = d1::list_project_webhooks(&database, &tenant, &project).await?;
    Response::from_json(&paginate_vec(req.url()?, items))
}

pub async fn create_project_webhook(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: WebhookRequest = req.json().await?;
    let name = body.name.trim();
    if name.is_empty() || body.url.trim().is_empty() {
        return json_error(400, "webhook name and url are required");
    }
    crate::webhooks::validate_webhook_url(&body.url)?;
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "webhooks:write",
    )
    .await?;
    if d1::active_project_webhook_count(&database, &tenant, &project).await? >= 20 {
        return json_error(429, "project webhook limit reached");
    }
    let item = d1::create_project_webhook(
        &database,
        &tenant,
        &project,
        &user,
        name,
        &body.url,
        &body.events,
    )
    .await?;
    Response::from_json(&item)
}

pub async fn delete_project_webhook(
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
        "webhooks:write",
    )
    .await?;
    if !d1::revoke_project_webhook(&database, &tenant, &project, &id).await? {
        return json_error(404, "webhook not found");
    }
    Response::from_json(&OkResponse { ok: true })
}

pub async fn test_project_webhook(
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
        "webhooks:write",
    )
    .await?;
    let Some(hook) = d1::project_webhook_by_id(&database, &tenant, &project, &id).await? else {
        return json_error(404, "webhook not found");
    };
    let result = crate::webhooks::enqueue_webhook_delivery(
        &ctx,
        &tenant,
        &project,
        &hook,
        "webhook.test",
        json!({ "tested_by": user }),
    )
    .await?;
    Response::from_json(
        &json!({ "ok": result.ok(), "queued": result.queued, "status": result.status }),
    )
}

pub async fn trigger_project_webhook(
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
        "webhooks:write",
    )
    .await?;
    let Some(hook) = d1::project_webhook_by_id(&database, &tenant, &project, &id).await? else {
        return json_error(404, "webhook not found");
    };
    if !hook.events.iter().any(|event| event == "manual") {
        return json_error(400, "webhook is not subscribed to manual events");
    }
    let result = crate::webhooks::enqueue_webhook_delivery(
        &ctx,
        &tenant,
        &project,
        &hook,
        "manual",
        json!({ "triggered_by": user }),
    )
    .await?;
    Response::from_json(
        &json!({ "ok": result.ok(), "queued": result.queued, "status": result.status }),
    )
}

pub async fn list_project_integrations(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "webhooks:read",
    )
    .await?;
    let items = d1::list_project_integrations(&database, &tenant, &project).await?;
    Response::from_json(&paginate_vec(req.url()?, items))
}

pub async fn delete_project_integration(
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
        "webhooks:write",
    )
    .await?;
    if !d1::revoke_project_integration(&database, &tenant, &project, &id).await? {
        return json_error(404, "integration not found");
    }
    Response::from_json(&OkResponse { ok: true })
}

pub async fn list_developer_apps(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let items = d1::list_developer_apps(&database, &user).await?;
    Response::from_json(&paginate_vec(req.url()?, items))
}

pub async fn create_developer_app(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let body: DeveloperAppRequest = req.json().await?;
    let name = body.name.trim();
    if name.is_empty() {
        return json_error(400, "app name is required");
    }
    validate_callback_url(&body.redirect_uri)?;
    if let Some(homepage) = body
        .homepage_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        validate_callback_url(homepage)?;
    }
    let database = db(&ctx)?;
    let item = d1::create_developer_app(
        &database,
        &user,
        name,
        &body.redirect_uri,
        body.description.as_deref(),
        body.homepage_url.as_deref(),
    )
    .await?;
    Response::from_json(&item)
}

pub async fn delete_developer_app(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let id = param(&ctx, "app_id")?;
    let database = db(&ctx)?;
    if !d1::revoke_developer_app(&database, &user, &id).await? {
        return json_error(404, "developer app not found");
    }
    Response::from_json(&OkResponse { ok: true })
}

pub async fn oauth_app(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let _ = req;
    let client_id = param(&ctx, "client_id")?;
    let database = db(&ctx)?;
    let Some(app) = d1::developer_app_by_client_id(&database, &client_id).await? else {
        return json_error(404, "developer app not found");
    };
    Response::from_json(&app)
}

pub async fn oauth_authorize(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    if user.starts_with("api-key:") {
        return json_error(403, "browser sign-in required");
    }
    let body: OAuthAuthorizeRequest = req.json().await?;
    validate_callback_url(&body.redirect_uri)?;
    let database = db(&ctx)?;
    check_project_write_role(&database, &body.tenant, &body.project, &user, "maintainer").await?;
    let scopes = oauth_scopes(body.scope.as_deref(), body.scopes.as_deref());
    let code = d1::create_oauth_code(
        &database,
        &body.client_id,
        &user,
        &body.tenant,
        &body.project,
        &scopes,
        &body.redirect_uri,
        body.state.as_deref(),
    )
    .await?;
    let redirect_url = oauth_redirect(&body.redirect_uri, &code, body.state.as_deref())?;
    Response::from_json(&json!({ "code": code, "redirect_url": redirect_url }))
}

pub async fn oauth_token(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let body: OAuthTokenRequest = req.json().await?;
    let grant_type = body.grant_type.or(body.grant_type_camel);
    if grant_type.as_deref().unwrap_or("authorization_code") != "authorization_code" {
        return json_error(400, "unsupported grant type");
    }
    let database = db(&ctx)?;
    let Some(grant) = d1::exchange_oauth_code(
        &database,
        &body.client_id,
        &body.client_secret,
        &body.code,
        &body.redirect_uri,
    )
    .await?
    else {
        return json_error(400, "invalid authorization code");
    };
    Response::from_json(&json!({
        "access_token": grant.access_token,
        "token_type": "Bearer",
        "expires_at": grant.expires_at,
        "scope": grant.scope,
        "tenant": grant.tenant,
        "project": grant.project,
        "integration_id": grant.integration_id
    }))
}

fn validate_callback_url(value: &str) -> Result<()> {
    let url = Url::parse(value.trim()).map_err(|_| Error::RustError("invalid url".to_string()))?;
    let host = url.host_str().unwrap_or_default();
    let local = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err(Error::RustError(
            "url must use https unless it targets localhost".to_string(),
        ));
    }
    Ok(())
}

fn oauth_redirect(redirect_uri: &str, code: &str, state: Option<&str>) -> Result<String> {
    let mut url =
        Url::parse(redirect_uri).map_err(|_| Error::RustError("invalid url".to_string()))?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("code", code);
        if let Some(state) = state {
            query.append_pair("state", state);
        }
    }
    Ok(url.to_string())
}

fn oauth_scopes(scope: Option<&str>, scopes: Option<&[String]>) -> Vec<String> {
    if let Some(scopes) = scopes {
        return scopes.to_vec();
    }
    scope
        .unwrap_or("main:read workspaces:read issues:read releases:read")
        .split_whitespace()
        .map(ToOwned::to_owned)
        .collect()
}
