use super::super::*;
use super::{CiJob, CiRunner, ensure_ci_schema};
use serde::Deserialize;

#[path = "limits.rs"]
mod limits;
#[path = "logs.rs"]
mod logs;

use limits::*;
pub use logs::*;

#[derive(Deserialize)]
struct CiJobRow {
    id: String,
    tenant: String,
    project: String,
    workspace: String,
    head: String,
    name: String,
    command: String,
    timeout_seconds: f64,
    status: String,
    conclusion: Option<String>,
    summary: Option<String>,
    runner_id: Option<String>,
    lease_expires_at: Option<String>,
    attempt: f64,
    max_attempts: f64,
    artifacts_json: String,
    cache_json: String,
    queued_at: String,
    started_at: Option<String>,
    completed_at: Option<String>,
    updated_at: String,
}

pub async fn enqueue_ci_jobs_for_head(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
    ci: &ProjectCiSettings,
) -> Result<Vec<CiJob>> {
    ensure_ci_schema(db).await?;
    if !ci.enabled || ci.commands.is_empty() {
        return Ok(Vec::new());
    }
    let mut jobs = Vec::new();
    for command in ci
        .commands
        .iter()
        .take(ci.max_jobs_per_head.clamp(1, 100) as usize)
    {
        if ci_job_exists_for_head(db, tenant, project, workspace, head, &command.name).await? {
            continue;
        }
        jobs.push(
            enqueue_ci_job(
                db,
                tenant,
                project,
                workspace,
                head,
                command,
                ci.max_attempts,
            )
            .await?,
        );
    }
    Ok(jobs)
}

pub async fn enqueue_ci_job(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
    command: &CiCommand,
    max_attempts: u32,
) -> Result<CiJob> {
    ensure_ci_schema(db).await?;
    let id = format!("cij_{}", Uuid::new_v4().simple());
    let now = now_rfc3339();
    let artifacts_json =
        serde_json::to_string(&command.artifacts).map_err(|e| err(e.to_string()))?;
    let cache_json = serde_json::to_string(&command.cache).map_err(|e| err(e.to_string()))?;
    db.prepare(
        "INSERT INTO ci_jobs
         (id, tenant, project, workspace, head, name, command, timeout_seconds, status, conclusion, summary, runner_id, lease_expires_at, attempt, max_attempts, artifacts_json, cache_json, queued_at, started_at, completed_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'queued', NULL, NULL, NULL, NULL, 0, ?9, ?10, ?11, ?12, NULL, NULL, ?12)",
    )
    .bind(&[
        js_str(&id),
        js_str(tenant),
        js_str(project),
        js_str(workspace),
        js_str(head),
        js_str(&command.name),
        js_str(&command.run),
        wasm_bindgen::JsValue::from_f64(command.timeout_seconds as f64),
        wasm_bindgen::JsValue::from_f64(max_attempts.clamp(1, 10) as f64),
        js_str(&artifacts_json),
        js_str(&cache_json),
        js_str(&now),
    ])?
    .run()
    .await?;
    upsert_workspace_check(
        db,
        tenant,
        project,
        workspace,
        Some(head),
        &command.name,
        "queued",
        None,
        Some("Waiting for a CI runner."),
        None,
    )
    .await?;
    ci_job(db, tenant, project, &id)
        .await?
        .ok_or_else(|| err("ci job not found"))
}

pub async fn claim_next_ci_job(
    db: &Database,
    runner: &CiRunner,
    ci: &ProjectCiSettings,
) -> Result<Option<CiJob>> {
    ensure_ci_schema(db).await?;
    reclaim_expired_ci_jobs(db, &runner.tenant, &runner.project).await?;
    if active_project_job_count(db, &runner.tenant, &runner.project).await?
        >= ci.max_concurrent_jobs.clamp(1, 100)
    {
        return Ok(None);
    }
    if active_runner_job_count(db, &runner.id).await? >= runner.concurrency.clamp(1, 32) {
        return Ok(None);
    }
    for _ in 0..5 {
        let row: Option<CiJobRow> = db
            .prepare(
                "SELECT id, tenant, project, workspace, head, name, command, timeout_seconds, status, conclusion, summary, runner_id, lease_expires_at, attempt, max_attempts, artifacts_json, cache_json, queued_at, started_at, completed_at, updated_at
                 FROM ci_jobs
                 WHERE tenant = ?1 AND project = ?2 AND status = 'queued' AND attempt < max_attempts
                 ORDER BY queued_at ASC
                 LIMIT 1",
            )
            .bind(&[js_str(&runner.tenant), js_str(&runner.project)])?
            .first(None)
            .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let now = now_rfc3339();
        let lease_expires_at = rfc3339_seconds_from_now(ci_lease_seconds(
            row.timeout_seconds as u32,
            ci.lease_grace_seconds,
        ));
        let max_attempts = ci.max_attempts.clamp(1, 10);
        let max_project_jobs = ci.max_concurrent_jobs.clamp(1, 100);
        let max_runner_jobs = runner.concurrency.clamp(1, 32);
        let result = db
            .prepare(
                "UPDATE ci_jobs
                 SET status = 'in_progress', runner_id = ?1, started_at = COALESCE(started_at, ?2), updated_at = ?2, lease_expires_at = ?3, attempt = attempt + 1, max_attempts = ?4
                 WHERE id = ?5 AND status = 'queued' AND attempt < ?4
                   AND (SELECT COUNT(*) FROM ci_jobs WHERE tenant = ?6 AND project = ?7 AND status = 'in_progress') < ?8
                   AND (SELECT COUNT(*) FROM ci_jobs WHERE runner_id = ?1 AND status = 'in_progress') < ?9",
            )
            .bind(&[
                js_str(&runner.id),
                js_str(&now),
                js_str(&lease_expires_at),
                wasm_bindgen::JsValue::from_f64(max_attempts as f64),
                js_str(&row.id),
                js_str(&runner.tenant),
                js_str(&runner.project),
                wasm_bindgen::JsValue::from_f64(max_project_jobs as f64),
                wasm_bindgen::JsValue::from_f64(max_runner_jobs as f64),
            ])?
            .run()
            .await?;
        if result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) == 0 {
            continue;
        }
        upsert_workspace_check(
            db,
            &row.tenant,
            &row.project,
            &row.workspace,
            Some(&row.head),
            &row.name,
            "in_progress",
            None,
            Some("Running on a CI runner."),
            None,
        )
        .await?;
        return ci_job(db, &row.tenant, &row.project, &row.id).await;
    }
    Ok(None)
}

pub async fn complete_ci_job(
    db: &Database,
    runner: &CiRunner,
    job_id: &str,
    conclusion: &str,
    summary: Option<&str>,
) -> Result<Option<CiJob>> {
    ensure_ci_schema(db).await?;
    let conclusion = normalize_ci_conclusion(conclusion)?;
    let summary = summary.map(str::trim).filter(|value| !value.is_empty());
    let now = now_rfc3339();
    let result = db
        .prepare(
            "UPDATE ci_jobs
             SET status = 'completed', conclusion = ?1, summary = ?2, completed_at = ?3, updated_at = ?3, lease_expires_at = NULL
             WHERE id = ?4 AND tenant = ?5 AND project = ?6 AND runner_id = ?7 AND status = 'in_progress'",
        )
        .bind(&[
            js_str(conclusion),
            js_opt(summary),
            js_str(&now),
            js_str(job_id),
            js_str(&runner.tenant),
            js_str(&runner.project),
            js_str(&runner.id),
        ])?
        .run()
        .await?;
    if result.meta()?.and_then(|meta| meta.changes).unwrap_or(0) == 0 {
        return Ok(None);
    }
    let Some(job) = ci_job(db, &runner.tenant, &runner.project, job_id).await? else {
        return Ok(None);
    };
    upsert_workspace_check(
        db,
        &job.tenant,
        &job.project,
        &job.workspace,
        Some(&job.head),
        &job.name,
        "completed",
        Some(conclusion),
        summary,
        None,
    )
    .await?;
    Ok(Some(job))
}

pub async fn list_ci_jobs(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: Option<&str>,
    limit: u64,
) -> Result<Vec<CiJob>> {
    ensure_ci_schema(db).await?;
    let result = if let Some(workspace) = workspace {
        db.prepare(
            "SELECT id, tenant, project, workspace, head, name, command, timeout_seconds, status, conclusion, summary, runner_id, lease_expires_at, attempt, max_attempts, artifacts_json, cache_json, queued_at, started_at, completed_at, updated_at
             FROM ci_jobs
             WHERE tenant = ?1 AND project = ?2 AND workspace = ?3
             ORDER BY queued_at DESC
             LIMIT ?4",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(workspace),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?
    } else {
        db.prepare(
            "SELECT id, tenant, project, workspace, head, name, command, timeout_seconds, status, conclusion, summary, runner_id, lease_expires_at, attempt, max_attempts, artifacts_json, cache_json, queued_at, started_at, completed_at, updated_at
             FROM ci_jobs
             WHERE tenant = ?1 AND project = ?2
             ORDER BY queued_at DESC
             LIMIT ?3",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            wasm_bindgen::JsValue::from_f64(limit as f64),
        ])?
        .all()
        .await?
    };
    let rows: Vec<CiJobRow> = result.results()?;
    Ok(rows.into_iter().map(ci_job_from_row).collect())
}

pub async fn ci_job(
    db: &Database,
    tenant: &str,
    project: &str,
    job_id: &str,
) -> Result<Option<CiJob>> {
    ensure_ci_schema(db).await?;
    let row: Option<CiJobRow> = db
        .prepare(
            "SELECT id, tenant, project, workspace, head, name, command, timeout_seconds, status, conclusion, summary, runner_id, lease_expires_at, attempt, max_attempts, artifacts_json, cache_json, queued_at, started_at, completed_at, updated_at
             FROM ci_jobs
             WHERE tenant = ?1 AND project = ?2 AND id = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(job_id)])?
        .first(None)
        .await?;
    Ok(row.map(ci_job_from_row))
}

pub async fn ci_job_active_for_runner(
    db: &Database,
    runner: &CiRunner,
    job_id: &str,
) -> Result<bool> {
    #[derive(Deserialize)]
    struct Row {
        count: f64,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT COUNT(*) AS count
             FROM ci_jobs
             WHERE id = ?1 AND tenant = ?2 AND project = ?3 AND runner_id = ?4 AND status = 'in_progress'",
        )
        .bind(&[
            js_str(job_id),
            js_str(&runner.tenant),
            js_str(&runner.project),
            js_str(&runner.id),
        ])?
        .first(None)
        .await?;
    Ok(row.is_some_and(|row| row.count > 0.0))
}

async fn reclaim_expired_ci_jobs(db: &Database, tenant: &str, project: &str) -> Result<()> {
    let now = now_rfc3339();
    let result = db
        .prepare(
            "SELECT id, tenant, project, workspace, head, name, command, timeout_seconds, status, conclusion, summary, runner_id, lease_expires_at, attempt, max_attempts, artifacts_json, cache_json, queued_at, started_at, completed_at, updated_at
             FROM ci_jobs
             WHERE tenant = ?1 AND project = ?2 AND status = 'in_progress' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?3
             ORDER BY lease_expires_at ASC
             LIMIT 25",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(&now)])?
        .all()
        .await?;
    let rows: Vec<CiJobRow> = result.results()?;
    for row in rows {
        if row.attempt >= row.max_attempts {
            expire_ci_job(db, &row, &now).await?;
        } else {
            requeue_ci_job(db, &row, &now).await?;
        }
    }
    Ok(())
}

async fn expire_ci_job(db: &Database, row: &CiJobRow, now: &str) -> Result<()> {
    db.prepare(
        "UPDATE ci_jobs
         SET status = 'completed', conclusion = 'failure', summary = ?1, runner_id = NULL, lease_expires_at = NULL, completed_at = ?2, updated_at = ?2
         WHERE id = ?3 AND status = 'in_progress'",
    )
    .bind(&[
        js_str("Runner lease expired after the retry limit."),
        js_str(now),
        js_str(&row.id),
    ])?
    .run()
    .await?;
    upsert_workspace_check(
        db,
        &row.tenant,
        &row.project,
        &row.workspace,
        Some(&row.head),
        &row.name,
        "completed",
        Some("failure"),
        Some("Runner lease expired after the retry limit."),
        None,
    )
    .await?;
    Ok(())
}

async fn requeue_ci_job(db: &Database, row: &CiJobRow, now: &str) -> Result<()> {
    db.prepare(
        "UPDATE ci_jobs
         SET status = 'queued', runner_id = NULL, lease_expires_at = NULL, summary = ?1, updated_at = ?2
         WHERE id = ?3 AND status = 'in_progress'",
    )
    .bind(&[
        js_str("Runner lease expired; waiting for another attempt."),
        js_str(now),
        js_str(&row.id),
    ])?
    .run()
    .await?;
    upsert_workspace_check(
        db,
        &row.tenant,
        &row.project,
        &row.workspace,
        Some(&row.head),
        &row.name,
        "queued",
        None,
        Some("Runner lease expired; waiting for another attempt."),
        None,
    )
    .await?;
    Ok(())
}

async fn ci_job_exists_for_head(
    db: &Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
    name: &str,
) -> Result<bool> {
    #[derive(Deserialize)]
    struct Row {
        count: f64,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT COUNT(*) AS count
             FROM ci_jobs
             WHERE tenant = ?1 AND project = ?2 AND workspace = ?3 AND head = ?4 AND name = ?5
               AND status IN ('queued', 'in_progress', 'completed')",
        )
        .bind(&[
            js_str(tenant),
            js_str(project),
            js_str(workspace),
            js_str(head),
            js_str(name),
        ])?
        .first(None)
        .await?;
    Ok(row.is_some_and(|row| row.count > 0.0))
}

fn normalize_ci_conclusion(value: &str) -> Result<&'static str> {
    match value {
        "success" | "passed" | "pass" => Ok("success"),
        "failure" | "failed" | "fail" => Ok("failure"),
        "canceled" | "cancelled" => Ok("canceled"),
        "timed_out" => Ok("timed_out"),
        "skipped" => Ok("skipped"),
        _ => Err(err("invalid ci conclusion")),
    }
}

fn ci_job_from_row(row: CiJobRow) -> CiJob {
    CiJob {
        id: row.id,
        tenant: row.tenant,
        project: row.project,
        workspace: row.workspace,
        head: row.head,
        name: row.name,
        command: row.command,
        timeout_seconds: row.timeout_seconds as u32,
        status: row.status,
        conclusion: row.conclusion,
        summary: row.summary,
        runner_id: row.runner_id,
        lease_expires_at: row.lease_expires_at,
        attempt: row.attempt as u32,
        max_attempts: row.max_attempts as u32,
        artifacts: serde_json::from_str(&row.artifacts_json).unwrap_or_default(),
        cache: serde_json::from_str(&row.cache_json).unwrap_or_default(),
        queued_at: row.queued_at,
        started_at: row.started_at,
        completed_at: row.completed_at,
        updated_at: row.updated_at,
    }
}
