use hmac::{Hmac, KeyInit, Mac};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use wasm_bindgen::{JsCast, closure::Closure};
use worker::*;

use crate::d1;
use crate::request_context::{AppContext, AppRouteContext, Database};
use crate::work_queue::{self, WEBHOOK_QUEUE_BINDING, WorkQueueMessage};

const WEBHOOK_TIMEOUT_MS: i32 = 5_000;
const WEBHOOK_BATCH_SIZE: usize = 100;

pub(crate) struct WebhookDispatchResult {
    pub queued: bool,
    pub status: i64,
}

impl WebhookDispatchResult {
    pub(crate) fn ok(&self) -> bool {
        self.queued || (200..300).contains(&self.status)
    }
}

pub(crate) fn emit_project_event(
    ctx: &AppRouteContext,
    tenant: &str,
    project: &str,
    event: &str,
    data: serde_json::Value,
) -> Result<()> {
    let app = ctx.data.clone();
    let tenant = tenant.to_string();
    let project = project.to_string();
    let event = event.to_string();
    ctx.data.wait_until(async move {
        if let Err(error) = enqueue_project_event(&app, &tenant, &project, &event, data).await {
            console_error!("failed to queue webhook event: {}", error);
        }
    });
    Ok(())
}

pub(crate) async fn enqueue_webhook_delivery(
    ctx: &AppRouteContext,
    tenant: &str,
    project: &str,
    hook: &d1::ProjectWebhook,
    event: &str,
    data: serde_json::Value,
) -> Result<WebhookDispatchResult> {
    let payload = event_payload(tenant, project, event, data);
    if let Ok(queue) = ctx.data.queue(WEBHOOK_QUEUE_BINDING) {
        work_queue::send_webhook_delivery(&queue, tenant, project, &hook.id, event, payload)
            .await?;
        return Ok(WebhookDispatchResult {
            queued: true,
            status: 202,
        });
    }
    let status = send_webhook_with_retries(hook, event, &payload).await;
    record_delivery_result(
        ctx.data.database(),
        tenant,
        project,
        &hook.id,
        event,
        &payload,
        status,
    )
    .await?;
    Ok(WebhookDispatchResult {
        queued: false,
        status,
    })
}

pub(crate) async fn dispatch_project_event(
    database: &Database,
    queue: Option<&Queue>,
    tenant: &str,
    project: &str,
    event: &str,
    data: serde_json::Value,
) -> Result<()> {
    let hooks = d1::active_project_webhooks(database, tenant, project, event).await?;
    if hooks.is_empty() {
        return Ok(());
    }
    if let Some(queue) = queue {
        for chunk in hooks.chunks(WEBHOOK_BATCH_SIZE) {
            let messages = chunk
                .iter()
                .map(|hook| WorkQueueMessage::WebhookDelivery {
                    tenant: tenant.to_string(),
                    project: project.to_string(),
                    hook_id: hook.id.clone(),
                    event: event.to_string(),
                    payload: event_payload(tenant, project, event, data.clone()),
                })
                .collect::<Vec<_>>();
            work_queue::send_webhook_delivery_batch(queue, messages).await?;
        }
        return Ok(());
    }
    for hook in hooks {
        let payload = event_payload(tenant, project, event, data.clone());
        let status = send_webhook_with_retries(&hook, event, &payload).await;
        record_delivery_result(database, tenant, project, &hook.id, event, &payload, status)
            .await?;
    }
    Ok(())
}

pub(crate) async fn deliver_webhook_delivery(
    database: &Database,
    tenant: &str,
    project: &str,
    hook_id: &str,
    event: &str,
    payload: &serde_json::Value,
) -> Result<()> {
    let Some(hook) = d1::project_webhook_by_id(database, tenant, project, hook_id).await? else {
        return Ok(());
    };
    let delivery_id = delivery_id(payload);
    if d1::webhook_delivery_succeeded(database, &delivery_id).await? {
        return Ok(());
    }
    let status = send_webhook(&hook, event, payload).await.unwrap_or(0);
    record_delivery_result(database, tenant, project, hook_id, event, payload, status).await?;
    if status == 0 || status >= 500 {
        return Err(Error::RustError(format!(
            "webhook delivery failed with status {status}"
        )));
    }
    Ok(())
}

async fn record_delivery_result(
    database: &Database,
    tenant: &str,
    project: &str,
    hook_id: &str,
    event: &str,
    payload: &serde_json::Value,
    status: i64,
) -> Result<()> {
    d1::record_webhook_delivery(
        database,
        tenant,
        project,
        hook_id,
        &delivery_id(payload),
        event,
        status,
        &payload_hash(payload)?,
        delivery_error(status).as_deref(),
    )
    .await
}

pub(crate) fn validate_webhook_url(value: &str) -> Result<()> {
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

async fn enqueue_project_event(
    app: &AppContext,
    tenant: &str,
    project: &str,
    event: &str,
    data: serde_json::Value,
) -> Result<()> {
    if let Ok(queue) = app.queue(WEBHOOK_QUEUE_BINDING) {
        work_queue::send_webhook_event(&queue, tenant, project, event, data).await?;
        return Ok(());
    }
    dispatch_project_event(app.database(), None, tenant, project, event, data).await
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

fn delivery_id(payload: &serde_json::Value) -> String {
    payload["delivery"].as_str().unwrap_or_default().to_string()
}

fn payload_hash(payload: &serde_json::Value) -> Result<String> {
    let payload_text =
        serde_json::to_string(payload).map_err(|e| Error::RustError(e.to_string()))?;
    Ok(format!(
        "sha256:{}",
        hex::encode(Sha256::digest(payload_text))
    ))
}

fn delivery_error(status: i64) -> Option<String> {
    match status {
        200..=299 => None,
        0 => Some("request failed before a response was received".to_string()),
        value => Some(format!("webhook endpoint returned status {value}")),
    }
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

fn is_restricted_webhook_host(host: &str) -> bool {
    let lower = host.trim_matches(['[', ']']).to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "localhost" | "localhost.localdomain" | "0.0.0.0"
    ) || lower.ends_with(".local")
        || lower.parse::<IpAddr>().is_ok_and(is_restricted_webhook_ip)
}

fn is_restricted_webhook_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(value) => is_restricted_ipv4(value),
        IpAddr::V6(value) => is_restricted_ipv6(value),
    }
}

fn is_restricted_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.octets()[0] == 0
        || ip.octets()[0] >= 224
}

fn is_restricted_ipv6(ip: Ipv6Addr) -> bool {
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_unique_local()
        || ip.is_unicast_link_local()
        || ip.is_multicast()
}
