use serde::Deserialize;
use sha2::{Digest, Sha256};
use sty_protocol::{
    Comment, HistoryEntry, Issue, NavbarItem, PanelItem, ProjectSettings, ProjectSummary,
    TenantSummary, TokenPrincipal, UserProfile, WorkspaceState, validate_segment,
};
use uuid::Uuid;
use worker::D1Database;
use worker::*;

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn err(msg: impl Into<String>) -> Error {
    Error::RustError(msg.into())
}

fn js_str(s: &str) -> wasm_bindgen::JsValue {
    wasm_bindgen::JsValue::from_str(s)
}

fn js_opt(s: Option<&str>) -> wasm_bindgen::JsValue {
    match s {
        Some(v) => wasm_bindgen::JsValue::from_str(v),
        None => wasm_bindgen::JsValue::NULL,
    }
}

fn now_rfc3339() -> String {
    let d = js_sys::Date::new_0();
    d.to_iso_string().into()
}

fn user_profile_from_parts(
    user: &str,
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    updated_at: Option<String>,
) -> Option<UserProfile> {
    display_name.map(|display_name| UserProfile {
        user: user.to_string(),
        display_name,
        handle,
        avatar_url,
        email,
        updated_at,
    })
}

// -- Auth -------------------------------------------------

mod auth;
mod history;
mod issues;
mod objects;
mod projects;
mod settings;
mod user_keys;
mod workspaces;

pub use auth::*;
pub use history::*;
pub use issues::*;
pub use objects::*;
pub use projects::*;
pub use settings::*;
pub use user_keys::*;
pub use workspaces::*;
