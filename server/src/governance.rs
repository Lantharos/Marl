use serde::Serialize;
use serde_json::json;
use sty_protocol::{MergeRules, ProjectSettings, TokenPrincipal};
use worker::*;

use crate::support::{db, json_error, paginate_vec, param, project_params, query_limit};
use crate::{
    check_project_capability, check_workspace_read_capability, check_workspace_write_capability,
    d1, optional_auth, require_auth,
};

#[derive(Debug, Clone, Serialize)]
pub struct MergeRequirementStatus {
    pub can_merge: bool,
    pub blocked_by: Vec<String>,
    pub required_approvals: u8,
    pub approvals: usize,
    pub stale_approvals: usize,
    pub unresolved_comments: u64,
    pub checks: d1::WorkspaceCheckSummary,
}

pub async fn list_notifications(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let database = db(&ctx)?;
    let limit = query_limit(&req, 50, 100)? as u64;
    let notifications = d1::list_notifications(&database, &user, limit).await?;
    Response::from_json(&paginate_vec(req.url()?, notifications))
}

pub async fn mark_notification_read(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let id = param(&ctx, "notification")?;
    let database = db(&ctx)?;
    if !d1::mark_notification_read(&database, &user, &id).await? {
        return json_error(404, "notification not found");
    }
    Response::from_json(&sty_protocol::OkResponse { ok: true })
}

pub async fn list_audit_log(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_capability(&database, &tenant, &project, &user, "maintainer", "settings:read")
        .await?;
    let events = d1::list_audit_events(
        &database,
        &tenant,
        &project,
        query_limit(&req, 100, 500)? as u64,
    )
    .await?;
    Response::from_json(&paginate_vec(req.url()?, events))
}

pub async fn list_workspace_checks(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_workspace_read_capability(&database, &tenant, &project, user.as_deref(), &workspace)
        .await?;
    let Some(state) = d1::workspace_state(&database, &tenant, &project, &workspace).await? else {
        return json_error(404, "workspace not found");
    };
    let head = query_text(&req, "head").or(state.head);
    let checks = d1::list_workspace_checks(
        &database,
        &tenant,
        &project,
        &workspace,
        head.as_deref(),
    )
    .await?;
    Response::from_json(&json!({
        "checks": checks,
        "summary": d1::workspace_check_summary(&database, &tenant, &project, &workspace, head.as_deref()).await?,
    }))
}

pub async fn submit_workspace_check(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let database = db(&ctx)?;
    check_workspace_write_capability(&database, &tenant, &project, &user, &workspace).await?;
    let Some(state) = d1::workspace_state(&database, &tenant, &project, &workspace).await? else {
        return json_error(404, "workspace not found");
    };
    let name = normalize_name(body["name"].as_str().unwrap_or("ci"))?;
    let status = normalize_status(body["status"].as_str().unwrap_or("completed"))?;
    let conclusion = normalize_conclusion(body["conclusion"].as_str());
    let head = body["head"].as_str().map(ToOwned::to_owned).or(state.head);
    let check = d1::upsert_workspace_check(
        &database,
        &tenant,
        &project,
        &workspace,
        head.as_deref(),
        &name,
        status,
        conclusion,
        body["summary"].as_str().map(str::trim).filter(|value| !value.is_empty()),
        body["details_url"]
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty()),
    )
    .await?;
    let settings = d1::project_settings(
        &database,
        &tenant,
        &project,
        Some(&TokenPrincipal { user: user.clone() }),
    )
    .await?;
    let merge_status = workspace_merge_status(
        &database,
        &tenant,
        &project,
        &workspace,
        head.as_deref(),
        &settings,
    )
    .await?;
    d1::set_workspace_mergeable(
        &database,
        &tenant,
        &project,
        &workspace,
        merge_status.can_merge,
    )
    .await?;
    d1::record_audit_event(
        &database,
        &tenant,
        &project,
        &user,
        "workspace.check",
        "workspace",
        &workspace,
        json!({ "name": name, "status": status, "conclusion": conclusion, "head": head }),
    )
    .await?;
    Response::from_json(&check)
}

pub async fn require_workspace_mergeable(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
    settings: &ProjectSettings,
) -> Result<Option<Response>> {
    let status = workspace_merge_status(database, tenant, project, workspace, head, settings).await?;
    d1::set_workspace_mergeable(database, tenant, project, workspace, status.can_merge).await?;
    if status.can_merge {
        return Ok(None);
    }
    json_error(409, &format!("merge blocked: {}", status.blocked_by.join(", "))).map(Some)
}

pub async fn workspace_merge_status(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
    settings: &ProjectSettings,
) -> Result<MergeRequirementStatus> {
    let rules = &settings.merge_rules;
    let approvals = approvals_for_rules(database, tenant, project, workspace, head, rules).await?;
    let stale_approvals =
        d1::stale_workspace_approvals(database, tenant, project, workspace, head).await?;
    let checks = d1::workspace_check_summary(database, tenant, project, workspace, head).await?;
    let unresolved =
        d1::unresolved_workspace_comment_count(database, tenant, project, workspace).await?;
    let mut blocked_by = Vec::new();
    if approvals.len() < rules.required_approvals as usize {
        blocked_by.push(format!(
            "{} approval{} required",
            rules.required_approvals,
            if rules.required_approvals == 1 { "" } else { "s" }
        ));
    }
    if rules.require_passing_checks && checks.state != "passing" {
        blocked_by.push("passing checks required".to_string());
    }
    if rules.block_unresolved_comments && unresolved > 0 {
        blocked_by.push(format!("{unresolved} unresolved file conversation(s)"));
    }
    Ok(MergeRequirementStatus {
        can_merge: blocked_by.is_empty(),
        blocked_by,
        required_approvals: rules.required_approvals,
        approvals: approvals.len(),
        stale_approvals: stale_approvals.len(),
        unresolved_comments: unresolved,
        checks,
    })
}

pub async fn notify_users(
    database: &crate::request_context::Database,
    users: impl IntoIterator<Item = String>,
    actor: &str,
    tenant: &str,
    project: &str,
    kind: &str,
    title: &str,
    body: &str,
    href: &str,
) -> Result<()> {
    let mut seen = std::collections::BTreeSet::new();
    for user in users {
        if user == actor || !seen.insert(user.clone()) {
            continue;
        }
        d1::create_notification(database, &user, tenant, project, kind, title, body, href).await?;
    }
    Ok(())
}

fn query_text(req: &Request, key: &str) -> Option<String> {
    req.url().ok()?.query_pairs().find_map(|(candidate, value)| {
        (candidate == key && !value.trim().is_empty()).then(|| value.to_string())
    })
}

fn normalize_name(value: &str) -> Result<String> {
    let name = value.trim();
    if name.is_empty() {
        return Err(Error::RustError("check name is required".to_string()));
    }
    Ok(name.chars().take(80).collect())
}

fn normalize_status(value: &str) -> Result<&'static str> {
    match value {
        "queued" | "pending" => Ok("queued"),
        "in_progress" | "running" => Ok("in_progress"),
        "completed" | "complete" => Ok("completed"),
        _ => Err(Error::RustError("invalid check status".to_string())),
    }
}

fn normalize_conclusion(value: Option<&str>) -> Option<&'static str> {
    match value.unwrap_or("success") {
        "success" | "passed" | "pass" => Some("success"),
        "failure" | "failed" | "fail" => Some("failure"),
        "cancelled" | "canceled" => Some("canceled"),
        "skipped" | "neutral" => Some("skipped"),
        "timed_out" => Some("timed_out"),
        "action_required" => Some("action_required"),
        _ => None,
    }
}

async fn approvals_for_rules(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
    head: Option<&str>,
    rules: &MergeRules,
) -> Result<Vec<d1::WorkspaceReview>> {
    if rules.dismiss_stale_approvals {
        d1::current_workspace_approvals(database, tenant, project, workspace, head).await
    } else {
        d1::latest_workspace_approvals(database, tenant, project, workspace).await
    }
}
