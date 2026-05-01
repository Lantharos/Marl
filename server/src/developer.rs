use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use serde_json::json;
use sha2::Sha256;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use sty_protocol::OkResponse;
use wasm_bindgen::{JsCast, closure::Closure};
use worker::*;

use crate::support::{db, json_error, paginate_vec, param, project_params};
use crate::{
    check_project_capability, check_project_write_capability, check_project_write_role, d1,
    require_auth,
};

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

const WEBHOOK_TIMEOUT_MS: i32 = 5_000;

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
    validate_webhook_url(&body.url)?;
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
    let payload = event_payload(
        &tenant,
        &project,
        "webhook.test",
        json!({ "tested_by": user }),
    );
    let status = send_webhook(&hook, "webhook.test", &payload)
        .await
        .unwrap_or(0);
    d1::record_webhook_delivery(&database, &tenant, &project, &id, status).await?;
    Response::from_json(&json!({ "ok": (200..300).contains(&status), "status": status }))
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

pub fn emit_project_event(
    ctx: &crate::request_context::AppRouteContext,
    tenant: &str,
    project: &str,
    event: &str,
    data: serde_json::Value,
) -> Result<()> {
    let database = ctx.data.database_handle();
    let tenant = tenant.to_string();
    let project = project.to_string();
    let event = event.to_string();
    ctx.data.wait_until(async move {
        let _ = deliver_project_event(&database, &tenant, &project, &event, data).await;
    });
    Ok(())
}

async fn deliver_project_event(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    event: &str,
    data: serde_json::Value,
) -> Result<()> {
    let hooks = d1::active_project_webhooks(database, tenant, project, event).await?;
    if hooks.is_empty() {
        return Ok(());
    }
    let payload = event_payload(tenant, project, event, data);
    for hook in hooks {
        let status = send_webhook_with_retries(&hook, event, &payload).await;
        d1::record_webhook_delivery(database, tenant, project, &hook.id, status).await?;
    }
    Ok(())
}

fn event_payload(
    tenant: &str,
    project: &str,
    event: &str,
    data: serde_json::Value,
) -> serde_json::Value {
    json!({
        "event": event,
        "delivery": uuid::Uuid::new_v4().to_string(),
        "tenant": tenant,
        "project": project,
        "sent_at": js_sys::Date::new_0().to_iso_string().as_string().unwrap_or_default(),
        "data": data
    })
}

async fn send_webhook(
    hook: &d1::ProjectWebhook,
    event: &str,
    payload: &serde_json::Value,
) -> Result<i64> {
    validate_webhook_url(&hook.url)?;
    let payload_text =
        serde_json::to_string(payload).map_err(|e| Error::RustError(e.to_string()))?;
    let headers = Headers::new();
    headers.set("content-type", "application/json")?;
    headers.set("user-agent", "sty-webhooks/1")?;
    headers.set("x-sty-event", event)?;
    headers.set(
        "x-sty-delivery",
        payload["delivery"].as_str().unwrap_or_default(),
    )?;
    if let Some(secret) = hook.secret.as_deref() {
        headers.set(
            "x-sty-signature-256",
            &webhook_signature(secret, &payload_text)?,
        )?;
    }
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(wasm_bindgen::JsValue::from_str(&payload_text)));
    let request = Request::new_with_init(&hook.url, &init)?;
    let controller = AbortController::default();
    let signal = controller.signal();
    let timeout = {
        let callback = Closure::once(move || {
            controller.abort_with_reason("webhook request timed out");
        });
        let global: web_sys::WorkerGlobalScope = js_sys::global().unchecked_into();
        let timeout = global
            .set_timeout_with_callback_and_timeout_and_arguments_0(
                callback.as_ref().unchecked_ref(),
                WEBHOOK_TIMEOUT_MS,
            )
            .map_err(|error| Error::RustError(format!("{error:?}")))?;
        callback.forget();
        (global, timeout)
    };
    let response = Fetch::Request(request).send_with_signal(&signal).await;
    timeout.0.clear_timeout_with_handle(timeout.1);
    let response = response?;
    Ok(response.status_code() as i64)
}

async fn send_webhook_with_retries(
    hook: &d1::ProjectWebhook,
    event: &str,
    payload: &serde_json::Value,
) -> i64 {
    let mut status = 0;
    for _ in 0..3 {
        status = send_webhook(hook, event, payload).await.unwrap_or(0);
        if (200..300).contains(&status) || (400..500).contains(&status) {
            break;
        }
    }
    status
}

fn webhook_signature(secret: &str, payload: &str) -> Result<String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .map_err(|_| Error::RustError("invalid webhook secret".to_string()))?;
    mac.update(payload.as_bytes());
    Ok(format!(
        "sha256={}",
        hex::encode(mac.finalize().into_bytes())
    ))
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

fn validate_webhook_url(value: &str) -> Result<()> {
    let url = Url::parse(value.trim()).map_err(|_| Error::RustError("invalid url".to_string()))?;
    if url.scheme() != "https" {
        return Err(Error::RustError("webhook url must use https".to_string()));
    }
    let host = url
        .host_str()
        .ok_or_else(|| Error::RustError("webhook url must include a host".to_string()))?;
    if is_restricted_webhook_host(host) {
        return Err(Error::RustError(
            "webhook url must not target localhost or private networks".to_string(),
        ));
    }
    Ok(())
}

fn is_restricted_webhook_host(host: &str) -> bool {
    let lower = host
        .trim_matches(|ch| ch == '[' || ch == ']')
        .to_ascii_lowercase();
    if lower == "localhost" || lower.ends_with(".localhost") || lower.ends_with(".local") {
        return true;
    }
    lower.parse::<IpAddr>().is_ok_and(is_restricted_webhook_ip)
}

fn is_restricted_webhook_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(value) => is_restricted_ipv4(value),
        IpAddr::V6(value) => is_restricted_ipv6(value),
    }
}

fn is_restricted_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.is_multicast()
        || (octets[0] == 100 && (64..=127).contains(&octets[1]))
        || (octets[0] == 198 && matches!(octets[1], 18 | 19))
}

fn is_restricted_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_restricted_ipv4(mapped);
    }
    let first = ip.segments()[0];
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (first & 0xfe00) == 0xfc00
        || (first & 0xffc0) == 0xfe80
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
