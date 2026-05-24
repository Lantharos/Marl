use super::super::*;
use serde::Deserialize;

pub(super) async fn active_project_job_count(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<u32> {
    count_active_jobs(
        db,
        "SELECT COUNT(*) AS count FROM ci_jobs WHERE tenant = ?1 AND project = ?2 AND status = 'in_progress'",
        &[js_str(tenant), js_str(project)],
    )
    .await
}

pub(super) async fn active_runner_job_count(db: &Database, runner_id: &str) -> Result<u32> {
    count_active_jobs(
        db,
        "SELECT COUNT(*) AS count FROM ci_jobs WHERE runner_id = ?1 AND status = 'in_progress'",
        &[js_str(runner_id)],
    )
    .await
}

pub(super) fn ci_lease_seconds(timeout_seconds: u32, grace_seconds: u32) -> u64 {
    u64::from(timeout_seconds)
        .saturating_add(u64::from(grace_seconds.clamp(30, 3600)))
        .clamp(60, 86_400)
}

async fn count_active_jobs(
    db: &Database,
    sql: &str,
    values: &[wasm_bindgen::JsValue],
) -> Result<u32> {
    #[derive(Deserialize)]
    struct Row {
        count: f64,
    }
    let row: Option<Row> = db.prepare(sql).bind(values)?.first(None).await?;
    Ok(row.map(|row| row.count as u32).unwrap_or(0))
}
