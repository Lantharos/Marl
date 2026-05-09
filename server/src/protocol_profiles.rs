use serde_json::json;
use worker::*;

use crate::d1;

pub(crate) async fn profile_json(
    database: &crate::request_context::Database,
    user: &str,
) -> Result<Response> {
    let profile = d1::user_profile(database, user).await?;
    let fallback = json!({
        "user": user,
        "username": user,
        "display_name": user,
        "handle": null,
        "account_tenant": null,
        "avatar_url": null,
        "avatar": null,
        "email": null,
        "updated_at": null,
        "bio": null,
        "created_at": "",
        "public_projects": 0,
    });
    let Some(profile) = profile else {
        return Response::from_json(&fallback);
    };
    Response::from_json(&json!({
        "user": profile.user,
        "username": profile.handle.clone().unwrap_or_else(|| profile.user.clone()),
        "display_name": profile.display_name,
        "handle": profile.handle,
        "account_tenant": profile.account_tenant,
        "avatar_url": profile.avatar_url,
        "avatar": profile.avatar_url,
        "email": profile.email,
        "updated_at": profile.updated_at,
        "bio": null,
        "created_at": "",
        "public_projects": 0,
    }))
}
