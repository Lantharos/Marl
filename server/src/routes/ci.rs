use serde::{Deserialize, Serialize};
use serde_json::json;
use worker::*;

use crate::features;
use crate::request_context::Database;
use crate::routes::objects::{
    check_project_capability, check_project_write_capability, require_auth,
};
use crate::support::{
    bearer_token, db, json_error, paginate_vec, param, project_params, query_limit,
};

#[derive(Deserialize)]
struct CreateRunnerRequest {
    name: String,
    concurrency: Option<u32>,
    labels: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct UpsertSecretRequest {
    key: String,
    value: String,
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

#[derive(Deserialize)]
struct ClaimJobRequest {
    labels: Option<Vec<String>>,
}

#[derive(Serialize)]
struct ClaimJobResponse {
    job: Option<features::CiJob>,
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
    let runners = features::list_ci_runners(database, &tenant, &project).await?;
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
    let labels = body.labels.unwrap_or_default();
    let runner = features::create_ci_runner(
        database,
        &tenant,
        &project,
        &user,
        name,
        concurrency,
        &labels,
    )
    .await?;
    features::record_audit_event(
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
    if !features::disable_ci_runner(database, &tenant, &project, &runner_id).await? {
        return json_error(404, "ci runner not found");
    }
    features::record_audit_event(
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
    let jobs = features::list_ci_jobs(
        database,
        &tenant,
        &project,
        workspace.as_deref(),
        query_limit(&req, 50, 200)? as u64,
    )
    .await?;
    Response::from_json(&paginate_vec(req.url()?, jobs))
}

pub(crate) async fn get_ci_job(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let runner = require_ci_runner(&req, &ctx, false).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    let job_id = param(&ctx, "job_id")?;
    let database = db(&ctx)?;
    let Some(job) = features::ci_job(database, &tenant, &project, &job_id).await? else {
        return json_error(404, "ci job not found");
    };
    Response::from_json(&job)
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
    if features::ci_job(database, &tenant, &project, &job_id)
        .await?
        .is_none()
    {
        return json_error(404, "ci job not found");
    }
    Response::from_json(&json!({ "logs": features::ci_job_logs(database, &job_id).await? }))
}

pub(crate) async fn list_ci_secrets(
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
    Response::from_json(
        &json!({ "secrets": features::list_ci_secrets(database, &tenant, &project).await? }),
    )
}

pub(crate) async fn upsert_ci_secret(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: UpsertSecretRequest = req.json().await?;
    let key = body.key.trim();
    if !valid_ci_secret_key(key) {
        return json_error(400, "invalid ci secret key");
    }
    if body.value.is_empty() || body.value.len() > 16_000 {
        return json_error(400, "invalid ci secret value");
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
    let secret =
        features::upsert_ci_secret(database, &tenant, &project, &user, key, &body.value).await?;
    features::record_audit_event(
        database,
        &tenant,
        &project,
        &user,
        "ci.secret_upsert",
        "ci_secret",
        key,
        json!({}),
    )
    .await?;
    Response::from_json(&secret)
}

pub(crate) async fn delete_ci_secret(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let key = param(&ctx, "key")?;
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
    if !features::delete_ci_secret(database, &tenant, &project, &key).await? {
        return json_error(404, "ci secret not found");
    }
    features::record_audit_event(
        database,
        &tenant,
        &project,
        &user,
        "ci.secret_delete",
        "ci_secret",
        &key,
        json!({}),
    )
    .await?;
    Response::from_json(&sty_protocol::OkResponse { ok: true })
}

pub(crate) async fn cancel_ci_job(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let job_id = param(&ctx, "job_id")?;
    let database = db(&ctx)?;
    check_project_write_capability(
        database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "status_checks",
    )
    .await?;
    let Some(job) = features::cancel_ci_job(
        database,
        &tenant,
        &project,
        &job_id,
        "Canceled by a maintainer.",
    )
    .await?
    else {
        return json_error(404, "ci job not found");
    };
    refresh_job_mergeability(database, &job).await?;
    features::record_audit_event(
        database,
        &tenant,
        &project,
        &user,
        "ci.job_canceled",
        "ci_job",
        &job.id,
        json!({ "workspace": job.workspace, "head": job.head, "name": job.name }),
    )
    .await?;
    Response::from_json(&job)
}

pub(crate) async fn rerun_ci_job(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let job_id = param(&ctx, "job_id")?;
    let database = db(&ctx)?;
    check_project_write_capability(
        database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "status_checks",
    )
    .await?;
    let Some(job) = features::rerun_ci_job(database, &tenant, &project, &job_id).await? else {
        return json_error(404, "ci job not found");
    };
    features::record_audit_event(
        database,
        &tenant,
        &project,
        &user,
        "ci.job_rerun",
        "ci_job",
        &job.id,
        json!({ "source_job": job_id, "workspace": job.workspace, "head": job.head, "name": job.name }),
    )
    .await?;
    let _ = crate::webhooks::emit_project_event(
        &ctx,
        &tenant,
        &project,
        "ci.jobs_queued",
        json!({ "workspace": job.workspace, "head": job.head, "jobs": [job.id.clone()] }),
    );
    Response::from_json(&job)
}

pub(crate) async fn claim_ci_job(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let mut runner = require_ci_runner(&req, &ctx, true).await?;
    let (tenant, project) = project_params(&ctx)?;
    if runner.tenant != tenant || runner.project != project {
        return json_error(403, "ci runner project mismatch");
    }
    let body = req.json::<ClaimJobRequest>().await.ok();
    if let Some(labels) = body
        .and_then(|body| body.labels)
        .filter(|labels| !labels.is_empty())
    {
        runner.labels = normalize_runner_claim_labels(labels);
    }
    let database = db(&ctx)?;
    let settings = features::project_settings(database, &tenant, &project, None).await?;
    let mut job = features::claim_next_ci_job(database, &runner, &settings.ci).await?;
    if let Some(job) = &mut job {
        job.env = ci_job_env(database, &tenant, &project, &job.name, &settings.ci).await?;
    }
    if let Some(job) = &job {
        features::record_audit_event(
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

async fn ci_job_env(
    database: &Database,
    tenant: &str,
    project: &str,
    job_name: &str,
    ci: &sty_protocol::ProjectCiSettings,
) -> Result<Vec<features::CiEnvVar>> {
    let mut env = features::ci_secret_env(database, tenant, project).await?;
    if let Some(command) = ci.commands.iter().find(|command| command.name == job_name) {
        if !command.secrets.is_empty() {
            env.retain(|item| command.secrets.iter().any(|key| key == &item.key));
        }
        for item in &command.env {
            if let Some(existing) = env.iter_mut().find(|existing| existing.key == item.key) {
                existing.value = item.value.clone();
            } else {
                env.push(features::CiEnvVar {
                    key: item.key.clone(),
                    value: item.value.clone(),
                });
            }
        }
    }
    Ok(env)
}

fn normalize_runner_claim_labels(labels: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for label in labels {
        let label = label
            .trim()
            .chars()
            .take(40)
            .map(|ch| ch.to_ascii_lowercase())
            .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_' || *ch == '.')
            .collect::<String>();
        if label.is_empty() || normalized.iter().any(|item| item == &label) {
            continue;
        }
        normalized.push(label);
        if normalized.len() >= 20 {
            break;
        }
    }
    normalized
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
    let text = features::redact_ci_secrets(database, &tenant, &project, &body.text).await?;
    if !features::append_ci_log(
        database,
        &runner,
        &job_id,
        body.stream.as_deref().unwrap_or("system"),
        &text,
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
    let database = db(&ctx)?;
    let mut redacted_lines = Vec::new();
    for line in body.lines.into_iter().take(256) {
        let text = features::redact_ci_secrets(database, &tenant, &project, &line.text).await?;
        redacted_lines.push((line.stream.unwrap_or_else(|| "system".to_string()), text));
    }
    let lines = redacted_lines
        .iter()
        .map(|line| features::CiLogInput {
            stream: line.0.as_str(),
            text: &line.1,
        })
        .collect::<Vec<_>>();
    if !features::append_ci_logs(database, &runner, &job_id, &lines).await? {
        return json_error(404, "active ci job not found");
    }
    Response::from_json(&sty_protocol::OkResponse { ok: true })
}

fn valid_ci_secret_key(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_')
        && value
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_uppercase() || ch == '_')
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
    let Some(job) = features::complete_ci_job(
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
    features::record_audit_event(
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
        features::record_audit_event(
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
    let jobs =
        materialize_ci_for_ready_head(&ctx.env, db(ctx)?, tenant, project, workspace, head).await?;
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
    env: &Env,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
) -> Result<Vec<String>> {
    let settings = features::project_settings(database, tenant, project, None).await?;
    let changed_paths = ci_changed_paths(env, database, tenant, project, workspace, head).await?;
    let jobs = features::enqueue_ci_jobs_for_head(
        database,
        tenant,
        project,
        workspace,
        head,
        &settings.ci,
        changed_paths.as_deref(),
    )
    .await?;
    if !jobs.is_empty() {
        features::record_audit_event(
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

async fn ci_changed_paths(
    env: &Env,
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: &str,
) -> Result<Option<Vec<String>>> {
    let Some(state) = features::workspace_state(database, tenant, project, workspace).await? else {
        return Ok(None);
    };
    let parent_workspace = state.parent_workspace.as_deref().unwrap_or("main");
    let Some(parent) =
        features::workspace_state(database, tenant, project, parent_workspace).await?
    else {
        return Ok(None);
    };
    let Some(parent_head) = parent.head.as_deref() else {
        return Ok(None);
    };
    crate::routes::graph::changed_paths_between_snapshots(env, tenant, project, head, parent_head)
        .await
        .map(Some)
}

pub(crate) async fn require_ci_runner(
    req: &Request,
    ctx: &crate::request_context::AppRouteContext,
    heartbeat: bool,
) -> Result<features::CiRunner> {
    let token = bearer_token(req)?;
    let database = db(ctx)?;
    let runner = features::ci_runner_by_token(database, &token)
        .await?
        .ok_or_else(|| Error::RustError("invalid ci runner token".to_string()))?;
    if heartbeat {
        features::touch_ci_runner(database, &runner.id, 60).await?;
    }
    Ok(runner)
}

async fn refresh_job_mergeability(
    database: &crate::request_context::Database,
    job: &features::CiJob,
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
    let settings = features::project_settings(database, tenant, project, None).await?;
    let status = crate::routes::governance::workspace_merge_status(
        database, tenant, project, workspace, head, &settings,
    )
    .await?;
    features::set_workspace_mergeable(database, tenant, project, workspace, status.can_merge).await
}
