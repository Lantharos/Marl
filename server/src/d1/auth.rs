use super::*;
pub async fn add_token(db: &D1Database, user: &str, expires_at: &str) -> Result<String> {
    let token = format!("sty_{}", Uuid::new_v4().simple());
    let hash = token_hash(&token);
    let created_at = now_rfc3339();
    db.prepare("INSERT INTO tokens (token_hash, user, created_at, expires_at, revoked_at, last_used_at) VALUES (?1, ?2, ?3, ?4, NULL, NULL)")
        .bind(&[js_str(&hash), js_str(user), js_str(&created_at), js_str(expires_at)])?
        .run()
        .await?;
    Ok(token)
}

pub async fn revoke_token(db: &D1Database, token: &str) -> Result<bool> {
    let hash = token_hash(token);
    let revoked_at = now_rfc3339();
    let result = db
        .prepare("UPDATE tokens SET revoked_at = ?1 WHERE token_hash = ?2 AND revoked_at IS NULL")
        .bind(&[js_str(&revoked_at), js_str(&hash)])?
        .run()
        .await?;
    Ok(result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) > 0)
}

pub async fn prune_expired_tokens(db: &D1Database) -> Result<()> {
    let now = now_rfc3339();
    db.prepare("DELETE FROM tokens WHERE expires_at <= ?1 OR revoked_at IS NOT NULL")
        .bind(&[js_str(&now)])?
        .run()
        .await?;
    Ok(())
}

pub async fn upsert_user_profile(db: &D1Database, profile: &UserProfile) -> Result<UserProfile> {
    let updated_at = now_rfc3339();
    let display_name = profile.display_name.trim();
    let display_name = if display_name.is_empty() {
        &profile.user
    } else {
        display_name
    };
    db.prepare(
        "INSERT INTO user_profiles (user, display_name, handle, avatar_url, email, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(user) DO UPDATE SET \
         display_name = excluded.display_name, handle = excluded.handle, avatar_url = excluded.avatar_url, \
         email = excluded.email, updated_at = excluded.updated_at"
    )
    .bind(&[
        js_str(&profile.user),
        js_str(display_name),
        js_opt(profile.handle.as_deref()),
        js_opt(profile.avatar_url.as_deref()),
        js_opt(profile.email.as_deref()),
        js_str(&updated_at),
    ])?
    .run()
    .await?;
    Ok(UserProfile {
        user: profile.user.clone(),
        display_name: display_name.to_string(),
        handle: profile.handle.clone(),
        avatar_url: profile.avatar_url.clone(),
        email: profile.email.clone(),
        updated_at: Some(updated_at),
    })
}

pub async fn user_profile(db: &D1Database, user: &str) -> Result<Option<UserProfile>> {
    #[derive(Deserialize)]
    struct Row {
        user: String,
        display_name: String,
        handle: Option<String>,
        avatar_url: Option<String>,
        email: Option<String>,
        updated_at: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT user, display_name, handle, avatar_url, email, updated_at FROM user_profiles WHERE user = ?1")
        .bind(&[js_str(user)])?
        .first(None)
        .await?;
    Ok(row.map(|row| UserProfile {
        user: row.user,
        display_name: row.display_name,
        handle: row.handle,
        avatar_url: row.avatar_url,
        email: row.email,
        updated_at: Some(row.updated_at),
    }))
}

pub async fn principal_for_token(db: &D1Database, token: &str) -> Result<Option<TokenPrincipal>> {
    let hash = token_hash(token);
    #[derive(Deserialize)]
    struct Row {
        user: String,
        expires_at: String,
        revoked_at: Option<String>,
    }
    let row: Option<Row> = db
        .prepare("SELECT user, expires_at, revoked_at FROM tokens WHERE token_hash = ?1")
        .bind(&[js_str(&hash)])?
        .first(None)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    if row.revoked_at.is_some() || row.expires_at <= now_rfc3339() {
        return Ok(None);
    }
    db.prepare("UPDATE tokens SET last_used_at = ?1 WHERE token_hash = ?2")
        .bind(&[js_str(&now_rfc3339()), js_str(&hash)])?
        .run()
        .await?;
    Ok(Some(TokenPrincipal { user: row.user }))
}

// -- Tenants / Projects -----------------------------------
