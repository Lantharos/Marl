use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use sty_protocol::OkResponse;
use worker::*;

use crate::support::{bucket, db, json_error, object_key, paginate_vec, param, r2_bytes};
use crate::{d1, require_auth};

pub async fn list_account_keys(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_account_key_kind(req, ctx, "signing_key").await
}

pub async fn create_account_key(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_account_key_kind(req, ctx, "signing_key").await
}

pub async fn delete_account_key(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    delete_account_key_kind(req, ctx, "signing_key").await
}

pub async fn list_account_ssh_keys(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    list_account_key_kind(req, ctx, "ssh_key").await
}

pub async fn create_account_ssh_key(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    create_account_key_kind(req, ctx, "ssh_key").await
}

pub async fn delete_account_ssh_key(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    delete_account_key_kind(req, ctx, "ssh_key").await
}

async fn list_account_key_kind(
    req: Request,
    ctx: RouteContext<()>,
    kind: &str,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let database = db(&ctx.env)?;
    let items = d1::list_user_keys(&database, &user, kind).await?;
    Response::from_json(&paginate_vec(req.url()?, items))
}

async fn create_account_key_kind(
    mut req: Request,
    ctx: RouteContext<()>,
    kind: &str,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
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
    }
    let database = db(&ctx.env)?;
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

async fn delete_account_key_kind(
    req: Request,
    ctx: RouteContext<()>,
    kind: &str,
) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let id = param(&ctx, "key_id")?;
    let database = db(&ctx.env)?;
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
    database: &worker::D1Database,
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
    if signature.algorithm != "ed25519" {
        return Ok(json!({
            "snapshot": id,
            "verified": false,
            "known": true,
            "signer": signature.user,
            "key_id": signature.key_id,
            "reason": "unsupported signing algorithm",
        }));
    }
    let Some(key) = d1::active_signing_key(database, &signature.user, &signature.key_id).await?
    else {
        return Ok(json!({
            "snapshot": id,
            "verified": false,
            "known": true,
            "signer": signature.user,
            "key_id": signature.key_id,
            "reason": "signing key is not registered",
        }));
    };
    let public_key = decode_ed25519_public_key(&key.public_key)?;
    let signature_bytes = decode_signature(&signature.signature)?;
    let verified = public_key.verify(id.as_bytes(), &signature_bytes).is_ok();
    Ok(json!({
        "snapshot": id,
        "verified": verified,
        "known": true,
        "signer": signature.user,
        "key_id": signature.key_id,
        "algorithm": signature.algorithm,
        "reason": if verified { serde_json::Value::Null } else { json!("signature mismatch") },
    }))
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
