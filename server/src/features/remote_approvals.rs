use super::*;
use std::sync::atomic::{AtomicBool, Ordering};

static REMOTE_APPROVALS_SCHEMA_READY: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct RemoteApproval {
    pub id: String,
    pub user: String,
    pub action: String,
    pub summary: String,
    pub payload_json: String,
    pub status: String,
    pub created_at: String,
    pub expires_at: String,
    pub approved_at: Option<String>,
}

pub async fn create_remote_approval(
    db: &Database,
    user: &str,
    action: &str,
    summary: &str,
    payload_json: &str,
    expires_at: &str,
) -> Result<RemoteApproval> {
    ensure_remote_approvals_schema(db).await?;
    let approval = RemoteApproval {
        id: Uuid::new_v4().simple().to_string(),
        user: user.to_string(),
        action: action.to_string(),
        summary: summary.to_string(),
        payload_json: payload_json.to_string(),
        status: "pending".to_string(),
        created_at: now_rfc3339(),
        expires_at: expires_at.to_string(),
        approved_at: None,
    };
    db.prepare(
        "INSERT INTO remote_approvals (id, user, action, summary, payload_json, status, created_at, expires_at, approved_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, NULL)",
    )
    .bind(&[
        js_str(&approval.id),
        js_str(user),
        js_str(action),
        js_str(summary),
        js_str(payload_json),
        js_str(&approval.created_at),
        js_str(expires_at),
    ])?
    .run()
    .await?;
    Ok(approval)
}

pub async fn remote_approval(db: &Database, id: &str) -> Result<Option<RemoteApproval>> {
    ensure_remote_approvals_schema(db).await?;
    expire_remote_approvals(db).await?;
    db.prepare(
        "SELECT id, user, action, summary, payload_json, status, created_at, expires_at, approved_at
         FROM remote_approvals
         WHERE id = ?1",
    )
    .bind(&[js_str(id)])?
    .first(None)
    .await
}

pub async fn approve_remote_approval(
    db: &Database,
    id: &str,
    user: &str,
) -> Result<Option<RemoteApproval>> {
    ensure_remote_approvals_schema(db).await?;
    expire_remote_approvals(db).await?;
    let approved_at = now_rfc3339();
    db.prepare(
        "UPDATE remote_approvals
         SET status = 'approved', approved_at = ?1
         WHERE id = ?2 AND user = ?3 AND status = 'pending' AND expires_at > ?4",
    )
    .bind(&[
        js_str(&approved_at),
        js_str(id),
        js_str(user),
        js_str(&approved_at),
    ])?
    .run()
    .await?;
    remote_approval(db, id).await
}

pub async fn consume_remote_approval(
    db: &Database,
    id: &str,
    user: &str,
    action: &str,
) -> Result<Option<RemoteApproval>> {
    ensure_remote_approvals_schema(db).await?;
    expire_remote_approvals(db).await?;
    let consumed_at = now_rfc3339();
    let existing = remote_approval(db, id).await?;
    let Some(existing) = existing else {
        return Ok(None);
    };
    if existing.user != user || existing.action != action || existing.status != "approved" {
        return Ok(Some(existing));
    }
    db.prepare(
        "UPDATE remote_approvals SET status = 'consumed' WHERE id = ?1 AND user = ?2 AND status = 'approved'",
    )
    .bind(&[js_str(id), js_str(user)])?
    .run()
    .await?;
    Ok(Some(RemoteApproval {
        status: "consumed".to_string(),
        approved_at: existing.approved_at.or(Some(consumed_at)),
        ..existing
    }))
}

async fn expire_remote_approvals(db: &Database) -> Result<()> {
    db.prepare(
        "UPDATE remote_approvals SET status = 'expired'
         WHERE status = 'pending' AND expires_at <= ?1",
    )
    .bind(&[js_str(&now_rfc3339())])?
    .run()
    .await?;
    Ok(())
}

async fn ensure_remote_approvals_schema(db: &Database) -> Result<()> {
    if REMOTE_APPROVALS_SCHEMA_READY.load(Ordering::Relaxed) {
        return Ok(());
    }
    db.prepare(
        "CREATE TABLE IF NOT EXISTS remote_approvals (
            id TEXT PRIMARY KEY,
            user TEXT NOT NULL,
            action TEXT NOT NULL,
            summary TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            approved_at TEXT
        )",
    )
    .run()
    .await?;
    db.prepare(
        "CREATE INDEX IF NOT EXISTS idx_remote_approvals_user_status ON remote_approvals(user, status)",
    )
    .run()
    .await?;
    REMOTE_APPROVALS_SCHEMA_READY.store(true, Ordering::Relaxed);
    Ok(())
}
