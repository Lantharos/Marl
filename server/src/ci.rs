use serde::{Deserialize, Serialize};
use serde_json::json;
use worker::*;

use crate::support::{
    bearer_token, db, json_error, paginate_vec, param, project_params, query_limit,
};
use crate::{check_project_capability, check_project_write_capability, d1, require_auth};

#[derive(Deserialize)]
struct CreateRunnerRequest {
    name: String,
    concurrency: Option<u32>,
}

#[derive(Deserialize)]
struct AppendLogRequest {
    stream: Option<String>,
    text: String,
}

#[derive(Deserialize)]
struct AppendLogBatchRequest {
    lines: Vec<AppendLogRequest>,
}

#[derive(Deserialize)]
struct CompleteJobRequest {
    conclusion: String,
    summary: Option<String>,
}

#[derive(Serialize)]
struct ClaimJobResponse {
    job: Option<d1::CiJob>,
    retry_after_seconds: u64,
}

pub(crate) async fn list_ci_runners(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_capability(
        database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "settings:read",
    )
    .await?;
    let runners = d1::list_ci_runners(database, &tenant, &project).await?;
    Response::from_json(&paginate_vec(req.url()?, runners))
}

pub(crate) async fn create_ci_runner(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: CreateRunnerRequest = req.json().await?;
    let name = body.name.trim();
    if name.is_empty() {
        return json_error(400, "runner name is required");
    }
    let database = db(&ctx)?;
    check_project_write_capability(
        database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "settings:write",
    )
    .await?;
    let concurrency = body.concurrency.unwrap_or(1).clamp(1, 32);
    let runner =
        d1::create_ci_runner(database, &tenant, &project, &user, name, concurrency).await?;
    d1::record_audit_event(
        database,
        &tenant,
        &project,
        &user,
        "ci.runner_create",
        "ci_runner",
        &runner.id,
        json!({ "name": runner.name.clone(), "concurrency": runner.concurrency }),
    )
    .await?;
    Response::from_json(&runner)
}

pub(crate) async fn delete_ci_runner(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let runner_id = param(&ctx, "runner_id")?;
    let database = db(&ctx)?;
    check_project_write_capability(
        database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "settings:write",
    )
    .await?;
    if !d1::disable_ci_runner(database, &tenant, &project, &runner_id).await? {
        return json_error(404, "ci runner not found");
    }
    d1::record_audit_event(
        database,
        &tenant,
        &project,
        &user,
        "ci.runner_disable",
        "ci_runner",
        &runner_id,
        json!({}),
    )
    .await?;
    Response::from_json(&sty_protocol::OkResponse { ok: true })
}

pub(crate) async fn list_ci_jobs(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_capability(
        database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "status_checks",
    )
    .await?;
    let workspace = req
        .url()?
        .query_pairs()
        .find_map(|(key, value)| (key == "workspace").then(|| value.to_string()))
        .filter(|value| !value.trim().is_empty());
    let jobs = d1::list_ci_jobs(
        database,
        &tenant,
        &project,
        workspace.as_deref(),
        query_limit(&req, 50, 200)? as u64,
    )
    .await?;
    Response::from_json(&paginate_vec(req.url()?, jobs))
}

pub(crate) async fn ci_job_logs(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let job_id = param(&ctx, "job_id")?;
    let database = db(&ctx)?;
    check_project_capability(
        database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "status_checks",
    )
    .await?;
    if d1::ci_job(database, &tenant, &project, &job_id)
        .await?
        .is_none()
    {
        return json_error(404, "ci job not found");
    }
    Response::from_json(&json!({ "logs": d1::ci_job_logs(database, &job_id).await? }))
}

pub(crate) async fn claim_ci_job(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let runner = require_ci_runner(&req, &ctx, true).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    let database = db(&ctx)?;
    let settings = d1::project_settings(database, &tenant, &project, None).await?;
    let job = d1::claim_next_ci_job(database, &runner, &settings.ci).await?;
    if let Some(job) = &job {
        d1::record_audit_event(
            database,
            &tenant,
            &project,
            "system",
            "ci.job_claimed",
            "ci_job",
            &job.id,
            json!({ "workspace": job.workspace, "head": job.head, "name": job.name, "runner": runner.id, "attempt": job.attempt }),
        )
        .await?;
        let _ = crate::webhooks::emit_project_event(
            &ctx,
            &tenant,
            &project,
            "ci.job_started",
            json!({ "job": job.id, "workspace": job.workspace, "head": job.head, "name": job.name, "runner": runner.id }),
        );
    }
    Response::from_json(&ClaimJobResponse {
        retry_after_seconds: if job.is_some() { 0 } else { 10 },
        job,
    })
}

pub(crate) async fn ci_runner_events(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let upgrade = req
        .headers()
        .get("upgrade")?
        .is_some_and(|value| value.eq_ignore_ascii_case("websocket"));
    if !upgrade {
        return json_error(426, "websocket upgrade required");
    }
    let runner = require_ci_runner(&req, &ctx, true).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    crate::ci_runner_pool::connect_runner(&ctx, &runner).await
}

pub(crate) async fn append_ci_job_log(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let runner = require_ci_runner(&req, &ctx, false).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    let job_id = param(&ctx, "job_id")?;
    let body: AppendLogRequest = req.json().await?;
    let database = db(&ctx)?;
    if !d1::append_ci_log(
        database,
        &runner,
        &job_id,
        body.stream.as_deref().unwrap_or("system"),
        &body.text,
    )
    .await?
    {
        return json_error(404, "active ci job not found");
    }
    Response::from_json(&sty_protocol::OkResponse { ok: true })
}

pub(crate) async fn append_ci_job_logs(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let runner = require_ci_runner(&req, &ctx, false).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    let job_id = param(&ctx, "job_id")?;
    let body: AppendLogBatchRequest = req.json().await?;
    let lines = body
        .lines
        .iter()
        .take(256)
        .map(|line| d1::CiLogInput {
            stream: line.stream.as_deref().unwrap_or("system"),
            text: &line.text,
        })
        .collect::<Vec<_>>();
    let database = db(&ctx)?;
    if !d1::append_ci_logs(database, &runner, &job_id, &lines).await? {
        return json_error(404, "active ci job not found");
    }
    Response::from_json(&sty_protocol::OkResponse { ok: true })
}

pub(crate) async fn complete_ci_job(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let runner = require_ci_runner(&req, &ctx, false).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    let job_id = param(&ctx, "job_id")?;
    let body: CompleteJobRequest = req.json().await?;
    let database = db(&ctx)?;
    let Some(job) = d1::complete_ci_job(
        database,
        &runner,
        &job_id,
        &body.conclusion,
        body.summary.as_deref(),
    )
    .await?
    else {
        return json_error(404, "active ci job not found");
    };
    refresh_job_mergeability(database, &job).await?;
    let _ = crate::webhooks::emit_project_event(
        &ctx,
        &tenant,
        &project,
        "ci.job_completed",
        json!({ "job": job.id, "workspace": job.workspace, "head": job.head, "name": job.name, "conclusion": job.conclusion }),
    );
    d1::record_audit_event(
        database,
        &tenant,
        &project,
        "system",
        "ci.job_completed",
        "ci_job",
        &job.id,
        json!({ "workspace": job.workspace, "head": job.head, "name": job.name, "conclusion": job.conclusion }),
    )
    .await?;
    Response::from_json(&job)
}

pub(crate) async fn enqueue_ci_for_ready_head(
    ctx: &crate::request_context::AppRouteContext,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
) -> Result<Vec<String>> {
    let Some(head) = head else {
        return Ok(Vec::new());
    };
    if let Ok(queue) = ctx.data.queue(crate::work_queue::CI_QUEUE_BINDING) {
        crate::work_queue::send_ci_ready_head(&queue, tenant, project, workspace, head).await?;
        let database = db(ctx)?;
        d1::record_audit_event(
            database,
            tenant,
            project,
            "system",
            "ci.queue_enqueued",
            "workspace",
            workspace,
            json!({ "head": head }),
        )
        .await?;
        return Ok(Vec::new());
    }
    let jobs = materialize_ci_for_ready_head(db(ctx)?, tenant, project, workspace, head).await?;
    if !jobs.is_empty() {
        let _ = crate::webhooks::emit_project_event(
            ctx,
            tenant,
            project,
            "ci.jobs_queued",
            json!({ "workspace": workspace, "head": head, "jobs": jobs.clone() }),
        );
        ctx.data.wait_until({
            let env = ctx.env.clone();
            let tenant = tenant.to_string();
            let project = project.to_string();
            let count = jobs.len();
            async move {
                let _ = crate::ci_runner_pool::notify_runners(&env, &tenant, &project, count).await;
            }
        });
    }
    Ok(jobs)
}

pub(crate) async fn materialize_ci_for_ready_head(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
) -> Result<Vec<String>> {
    let settings = d1::project_settings(database, tenant, project, None).await?;
    let jobs =
        d1::enqueue_ci_jobs_for_head(database, tenant, project, workspace, head, &settings.ci)
            .await?;
    if !jobs.is_empty() {
        d1::record_audit_event(
            database,
            tenant,
            project,
            "system",
            "ci.jobs_queued",
            "workspace",
            workspace,
            json!({ "head": head, "jobs": jobs.iter().map(|job| job.id.clone()).collect::<Vec<_>>() }),
        )
        .await?;
    }
    refresh_workspace_mergeability(database, tenant, project, workspace, Some(head)).await?;
    Ok(jobs.into_iter().map(|job| job.id).collect())
}

pub(crate) async fn require_ci_runner(
    req: &Request,
    ctx: &crate::request_context::AppRouteContext,
    heartbeat: bool,
) -> Result<d1::CiRunner> {
    let token = bearer_token(req)?;
    let database = db(ctx)?;
    let runner = d1::ci_runner_by_token(database, &token)
        .await?
        .ok_or_else(|| Error::RustError("invalid ci runner token".to_string()))?;
    if heartbeat {
        d1::touch_ci_runner(database, &runner.id, 60).await?;
    }
    Ok(runner)
}

async fn refresh_job_mergeability(
    database: &crate::request_context::Database,
    job: &d1::CiJob,
) -> Result<()> {
    refresh_workspace_mergeability(
        database,
        &job.tenant,
        &job.project,
        &job.workspace,
        Some(&job.head),
    )
    .await
}

async fn refresh_workspace_mergeability(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
) -> Result<()> {
    let settings = d1::project_settings(database, tenant, project, None).await?;
    let status = crate::governance::workspace_merge_status(
        database, tenant, project, workspace, head, &settings,
    )
    .await?;
    d1::set_workspace_mergeable(database, tenant, project, workspace, status.can_merge).await
}
