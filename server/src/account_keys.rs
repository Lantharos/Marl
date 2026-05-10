use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use sty_protocol::{
    OkResponse, RemoteApprovalRequest, RemoteApprovalResponse, RemoteApprovalStatus,
};
use worker::*;

use crate::support::{
    bearer_token, bucket, db, frontend_origin, json_error, object_key, paginate_vec, param,
    r2_bytes,
};
use crate::{d1, require_auth, require_web_auth};

pub async fn list_account_keys(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    list_account_key_kind(req, ctx, "signing_key").await
}

pub async fn create_account_key(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    create_account_key_kind(req, ctx, "signing_key").await
}

pub async fn delete_account_key(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    delete_account_key_kind(req, ctx, "signing_key").await
}

pub async fn list_account_ssh_keys(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    list_account_key_kind(req, ctx, "ssh_key").await
}

pub async fn create_account_ssh_key(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    create_account_key_kind(req, ctx, "ssh_key").await
}

pub async fn delete_account_ssh_key(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    delete_account_key_kind(req, ctx, "ssh_key").await
}

pub async fn create_remote_approval(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let body: RemoteApprovalRequest = req.json().await?;
    if body.action.trim().is_empty() || body.summary.trim().is_empty() {
        return json_error(400, "approval action and summary are required");
    }
    let payload_json = serde_json::to_string(&body.payload)
        .map_err(|error| Error::RustError(error.to_string()))?;
    let database = db(&ctx)?;
    let expires_at = approval_expires_at();
    let approval = d1::create_remote_approval(
        &database,
        &user,
        body.action.trim(),
        body.summary.trim(),
        &payload_json,
        &expires_at,
    )
    .await?;
    Response::from_json(&approval_response(&req, &ctx.env, approval))
}

pub async fn get_remote_approval(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let id = param(&ctx, "approval_id")?;
    let database = db(&ctx)?;
    let Some(approval) = d1::remote_approval(&database, &id).await? else {
        return json_error(404, "approval not found");
    };
    if approval.user != user {
        return json_error(404, "approval not found");
    }
    Response::from_json(&RemoteApprovalStatus {
        id: approval.id,
        action: approval.action,
        summary: approval.summary,
        status: approval.status,
        expires_at: approval.expires_at,
        approved_at: approval.approved_at,
    })
}

pub async fn approve_remote_approval(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_web_auth(&req, &ctx).await?;
    let id = param(&ctx, "approval_id")?;
    let database = db(&ctx)?;
    let Some(approval) = d1::approve_remote_approval(&database, &id, &user).await? else {
        return json_error(404, "approval not found");
    };
    Response::from_json(&RemoteApprovalStatus {
        id: approval.id,
        action: approval.action,
        summary: approval.summary,
        status: approval.status,
        expires_at: approval.expires_at,
        approved_at: approval.approved_at,
    })
}

async fn list_account_key_kind(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
    kind: &str,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let items = d1::list_user_keys(&database, &user, kind).await?;
    Response::from_json(&paginate_vec(req.url()?, items))
}

async fn create_account_key_kind(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
    kind: &str,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let public_key = body["public_key"]
        .as_str()
        .or_else(|| body["key"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| Error::RustError("public key is required".to_string()))?
        .to_string();
    let algorithm = body["algorithm"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default_key_algorithm(kind, &public_key))
        .to_string();
    let fingerprint = fingerprint(&public_key);
    let id = body["id"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&fingerprint)
        .to_string();
    let name = body["name"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&id)
        .to_string();
    if kind == "signing_key" {
        decode_ed25519_public_key(&public_key)?;
        require_signing_key_approval(&req, &ctx, &user, &body).await?;
    }
    let database = db(&ctx)?;
    let item = d1::UserKey {
        id,
        user,
        kind: kind.to_string(),
        name,
        public_key,
        fingerprint,
        algorithm,
        created_at: js_sys::Date::new_0()
            .to_iso_string()
            .as_string()
            .unwrap_or_default(),
        revoked_at: None,
    };
    d1::upsert_user_key(&database, &item).await?;
    Response::from_json(&item)
}

async fn require_signing_key_approval(
    req: &Request,
    ctx: &crate::request_context::AppRouteContext,
    user: &str,
    body: &serde_json::Value,
) -> Result<()> {
    let database = db(ctx)?;
    let token = bearer_token(req)?;
    if matches!(
        d1::token_kind(&database, &token).await?.as_deref(),
        Some("web")
    ) {
        return Ok(());
    }
    let approval_id = body["approval_id"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            Error::RustError("browser approval required for signing key upload".to_string())
        })?;
    match d1::consume_remote_approval(&database, approval_id, user, "signing_key_upload").await? {
        Some(approval) if approval.status == "consumed" => Ok(()),
        Some(approval) => Err(Error::RustError(format!("approval is {}", approval.status))),
        None => Err(Error::RustError("approval not found".to_string())),
    }
}

fn approval_response(
    req: &Request,
    env: &Env,
    approval: d1::RemoteApproval,
) -> RemoteApprovalResponse {
    RemoteApprovalResponse {
        id: approval.id.clone(),
        action: approval.action,
        summary: approval.summary,
        status: approval.status,
        verify_url: verify_url(req, env, &approval.id),
        expires_at: approval.expires_at,
    }
}

fn verify_url(req: &Request, env: &Env, id: &str) -> String {
    format!(
        "{}/verify/{id}",
        frontend_origin(req, env).trim_end_matches('/')
    )
}

fn approval_expires_at() -> String {
    let date = js_sys::Date::new_0();
    date.set_time(date.get_time() + 5.0 * 60.0 * 1000.0);
    date.to_iso_string().into()
}

async fn delete_account_key_kind(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
    kind: &str,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let id = param(&ctx, "key_id")?;
    let database = db(&ctx)?;
    let Some(item) = d1::user_key_by_id(&database, &user, &id).await? else {
        return json_error(404, "key not found");
    };
    if item.kind != kind {
        return json_error(404, "key not found");
    }
    d1::revoke_user_key(&database, &user, &id).await?;
    Response::from_json(&OkResponse { ok: true })
}

#[derive(Deserialize)]
struct SignedSnapshot {
    #[serde(default)]
    signature: Option<SnapshotSignature>,
}

#[derive(Deserialize)]
struct SnapshotSignature {
    user: String,
    key_id: String,
    algorithm: String,
    signature: String,
}

pub async fn verify_snapshot_id(
    database: &crate::request_context::Database,
    env: &Env,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<serde_json::Value> {
    let known = matches!(
        d1::object_kind(database, tenant, project, id).await?,
        Some(kind) if kind == "snapshot"
    );
    if !known {
        return Ok(json!({
            "snapshot": id,
            "verified": false,
            "known": false,
            "reason": "snapshot not found",
        }));
    }
    let bytes = r2_bytes(&bucket(env)?, &object_key(tenant, project, id)).await?;
    let snapshot: SignedSnapshot =
        serde_json::from_slice(&bytes).map_err(|error| Error::RustError(error.to_string()))?;
    let Some(signature) = snapshot.signature else {
        return Ok(json!({
            "snapshot": id,
            "verified": false,
            "known": true,
            "reason": "snapshot is unsigned",
        }));
    };
    if let Err(reason) = validate_snapshot_signature(database, &bytes).await {
        return Ok(json!({
            "snapshot": id,
            "verified": false,
            "known": true,
            "signer": signature.user,
            "key_id": signature.key_id,
            "reason": reason,
        }));
    }
    Ok(json!({
        "snapshot": id,
        "verified": true,
        "known": true,
        "signer": signature.user,
        "key_id": signature.key_id,
        "algorithm": signature.algorithm,
        "reason": serde_json::Value::Null,
    }))
}

pub async fn validate_snapshot_signature(
    database: &crate::request_context::Database,
    bytes: &[u8],
) -> Result<(), String> {
    let snapshot: SignedSnapshot = serde_json::from_slice(bytes)
        .map_err(|_| "snapshot signature payload is invalid".to_string())?;
    let Some(signature) = snapshot.signature else {
        return Ok(());
    };
    if signature.algorithm != "ed25519" {
        return Err("unsupported signing algorithm".to_string());
    }
    let key = d1::active_signing_key(database, &signature.user, &signature.key_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "signing key is not registered".to_string())?;
    let public_key =
        decode_ed25519_public_key(&key.public_key).map_err(|error| error.to_string())?;
    let signature_bytes =
        decode_signature(&signature.signature).map_err(|error| error.to_string())?;
    let id = snapshot_id_without_signature(bytes).map_err(|error| error.to_string())?;
    if public_key.verify(id.as_bytes(), &signature_bytes).is_err() {
        return Err("signature mismatch".to_string());
    }
    Ok(())
}

fn snapshot_id_without_signature(bytes: &[u8]) -> Result<String> {
    let mut snapshot: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|error| Error::RustError(error.to_string()))?;
    if let Some(object) = snapshot.as_object_mut() {
        object.insert("id".to_string(), serde_json::Value::String(String::new()));
        object.remove("signature");
    }
    let canonical =
        serde_json::to_vec(&snapshot).map_err(|error| Error::RustError(error.to_string()))?;
    Ok(hex::encode(Sha256::digest(canonical)))
}

fn decode_ed25519_public_key(value: &str) -> Result<VerifyingKey> {
    let bytes = BASE64
        .decode(value.trim())
        .map_err(|_| Error::RustError("invalid ed25519 public key".to_string()))?;
    let key_bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| Error::RustError("invalid ed25519 public key length".to_string()))?;
    VerifyingKey::from_bytes(&key_bytes)
        .map_err(|error| Error::RustError(format!("invalid ed25519 public key: {error}")))
}

fn decode_signature(value: &str) -> Result<Signature> {
    let bytes = BASE64
        .decode(value.trim())
        .map_err(|_| Error::RustError("invalid ed25519 signature".to_string()))?;
    let signature_bytes: [u8; 64] = bytes
        .try_into()
        .map_err(|_| Error::RustError("invalid ed25519 signature length".to_string()))?;
    Ok(Signature::from_bytes(&signature_bytes))
}

fn fingerprint(value: &str) -> String {
    hex::encode(Sha256::digest(value.trim().as_bytes()))
}

fn default_key_algorithm(kind: &str, public_key: &str) -> &'static str {
    if kind == "signing_key" {
        "ed25519"
    } else if public_key.starts_with("ssh-ed25519 ") {
        "ssh-ed25519"
    } else {
        "ssh"
    }
}
