use super::*;

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct UserKey {
    pub id: String,
    pub user: String,
    pub kind: String,
    pub name: String,
    pub public_key: String,
    pub fingerprint: String,
    pub algorithm: String,
    pub created_at: String,
    pub revoked_at: Option<String>,
}

pub async fn list_user_keys(db: &Database, user: &str, kind: &str) -> Result<Vec<UserKey>> {
    ensure_user_keys_schema(db).await?;
    let result = db
        .prepare(
            "SELECT id, user, kind, name, public_key, fingerprint, algorithm, created_at, revoked_at
             FROM user_keys
             WHERE user = ?1 AND kind = ?2 AND revoked_at IS NULL
             ORDER BY created_at DESC",
        )
        .bind(&[js_str(user), js_str(kind)])?
        .all()
        .await?;
    result.results()
}

pub async fn user_key_by_id(db: &Database, user: &str, id: &str) -> Result<Option<UserKey>> {
    ensure_user_keys_schema(db).await?;
    db.prepare(
        "SELECT id, user, kind, name, public_key, fingerprint, algorithm, created_at, revoked_at
         FROM user_keys
         WHERE user = ?1 AND id = ?2 AND revoked_at IS NULL",
    )
    .bind(&[js_str(user), js_str(id)])?
    .first(None)
    .await
}

pub async fn active_signing_key(
    db: &Database,
    user: &str,
    key_id: &str,
) -> Result<Option<UserKey>> {
    ensure_user_keys_schema(db).await?;
    db.prepare(
        "SELECT id, user, kind, name, public_key, fingerprint, algorithm, created_at, revoked_at
         FROM user_keys
         WHERE user = ?1 AND id = ?2 AND kind = 'signing_key' AND revoked_at IS NULL",
    )
    .bind(&[js_str(user), js_str(key_id)])?
    .first(None)
    .await
}

pub async fn upsert_user_key(db: &Database, key: &UserKey) -> Result<()> {
    ensure_user_keys_schema(db).await?;
    db.prepare(
        "INSERT INTO user_keys (id, user, kind, name, public_key, fingerprint, algorithm, created_at, revoked_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL)
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             public_key = excluded.public_key,
             fingerprint = excluded.fingerprint,
             algorithm = excluded.algorithm,
             revoked_at = NULL",
    )
    .bind(&[
        js_str(&key.id),
        js_str(&key.user),
        js_str(&key.kind),
        js_str(&key.name),
        js_str(&key.public_key),
        js_str(&key.fingerprint),
        js_str(&key.algorithm),
        js_str(&key.created_at),
    ])?
    .run()
    .await?;
    Ok(())
}

pub async fn revoke_user_key(db: &Database, user: &str, id: &str) -> Result<bool> {
    ensure_user_keys_schema(db).await?;
    let existing = user_key_by_id(db, user, id).await?;
    if existing.is_none() {
        return Ok(false);
    }
    db.prepare("UPDATE user_keys SET revoked_at = ?1 WHERE user = ?2 AND id = ?3")
        .bind(&[js_str(&now_rfc3339()), js_str(user), js_str(id)])?
        .run()
        .await?;
    Ok(true)
}

async fn ensure_user_keys_schema(db: &Database) -> Result<()> {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS user_keys (
            id TEXT PRIMARY KEY,
            user TEXT NOT NULL,
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            public_key TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            algorithm TEXT NOT NULL,
            created_at TEXT NOT NULL,
            revoked_at TEXT
        )",
    )
    .run()
    .await?;
    db.prepare("CREATE INDEX IF NOT EXISTS idx_user_keys_user_kind ON user_keys(user, kind)")
        .run()
        .await?;
    db.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_keys_user_fingerprint ON user_keys(user, fingerprint)",
    )
    .run()
    .await?;
    Ok(())
}
