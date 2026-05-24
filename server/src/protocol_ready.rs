use serde_json::json;
use sty_protocol::OkResponse;
use worker::*;

use crate::support::{
    bucket, db, json_error, object_key, paginate_vec, param, project_params, r2_bytes,
    validate_object_id,
};
use crate::{
    check_project_read_capability, check_project_write_capability, d1, optional_auth, require_auth,
};

pub async fn list_ready(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        "workspaces:read",
    )
    .await?;
    let mut ready = Vec::new();
    for workspace in d1::filter_visible_workspaces(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        d1::workspace_states(&database, &tenant, &project).await?,
    )
    .await?
    .into_iter()
    .filter(|workspace| workspace.is_ready && workspace.name != "main")
    {
        ready.push(ready_workspace_json(&ctx, &tenant, &project, workspace).await?);
    }
    Response::from_json(&paginate_vec(req.url()?, ready))
}

pub async fn get_ready(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    crate::check_workspace_read_capability(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        &workspace,
    )
    .await?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace && item.is_ready);
    match state {
        Some(item) => {
            let ready = ready_workspace_json(&ctx, &tenant, &project, item).await?;
            Response::from_json(&ready)
        }
        None => json_error(404, "ready workspace not found"),
    }
}

pub async fn list_workspace_reviews(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    crate::check_workspace_read_capability(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        &workspace,
    )
    .await?;
    if !workspace_exists(&database, &tenant, &project, &workspace).await? {
        return json_error(404, "workspace not found");
    }
    let reviews = d1::list_workspace_reviews(&database, &tenant, &project, &workspace).await?;
    Response::from_json(&paginate_vec(req.url()?, reviews))
}

pub async fn submit_workspace_review(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "workspaces:ready",
    )
    .await?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace);
    let Some(workspace_state) = state else {
        return json_error(404, "workspace not found");
    };
    if workspace == "main" {
        return json_error(404, "workspace not found");
    }
    if !workspace_state.is_ready || workspace_state.status != "ready" {
        return json_error(409, "workspace is not ready");
    }
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    let review_state = normalize_review_state(body["state"].as_str())?;
    let message = body["body"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let review = d1::submit_workspace_review(
        &database,
        &tenant,
        &project,
        &workspace,
        &sty_protocol::TokenPrincipal { user: user.clone() },
        review_state,
        message,
        workspace_state.head.as_deref(),
    )
    .await?;
    let settings = d1::project_settings(
        &database,
        &tenant,
        &project,
        Some(&sty_protocol::TokenPrincipal { user: user.clone() }),
    )
    .await?;
    let merge_status = crate::governance::workspace_merge_status(
        &database,
        &tenant,
        &project,
        &workspace,
        workspace_state.head.as_deref(),
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
        "workspace.review",
        "workspace",
        &workspace,
        json!({ "state": review.state.clone(), "head": review.head.clone() }),
    )
    .await?;
    crate::governance::notify_users(
        &database,
        workspace_state
            .reviewers
            .iter()
            .chain(workspace_state.assignees.iter())
            .cloned()
            .collect::<Vec<_>>(),
        &user,
        &tenant,
        &project,
        "workspace.review",
        &format!("{workspace} was reviewed"),
        "A workspace review was submitted.",
        &format!("/{tenant}/{project}/workspaces/{workspace}"),
    )
    .await?;
    Response::from_json(&review)
}

pub async fn unmark_ready(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "workspaces:ready",
    )
    .await?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace);
    let Some(state) = state else {
        return json_error(404, "workspace not found");
    };
    if workspace == "main" {
        return json_error(404, "workspace not found");
    }
    if !state.is_ready || state.status != "ready" {
        return json_error(409, "workspace is not ready");
    }
    d1::unmark_workspace_ready(
        &database,
        &tenant,
        &project,
        &workspace,
        &sty_protocol::TokenPrincipal { user },
    )
    .await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn ready_workspace_json(
    ctx: &crate::request_context::AppRouteContext,
    tenant: &str,
    project: &str,
    workspace: sty_protocol::WorkspaceState,
) -> Result<serde_json::Value> {
    let database = db(ctx)?;
    let marker = d1::latest_ready_marker(database, tenant, project, &workspace.name).await?;
    let settings = d1::project_settings(database, tenant, project, None).await?;
    let approvals = if settings.merge_rules.dismiss_stale_approvals {
        d1::current_workspace_approvals(
            database,
            tenant,
            project,
            &workspace.name,
            workspace.head.as_deref(),
        )
        .await?
    } else {
        d1::latest_workspace_approvals(database, tenant, project, &workspace.name).await?
    };
    let stale_approvals = d1::stale_workspace_approvals(
        database,
        tenant,
        project,
        &workspace.name,
        workspace.head.as_deref(),
    )
    .await?;
    let checks = d1::list_workspace_checks(
        database,
        tenant,
        project,
        &workspace.name,
        workspace.head.as_deref(),
    )
    .await?;
    let merge_requirements = crate::governance::workspace_merge_status(
        database,
        tenant,
        project,
        &workspace.name,
        workspace.head.as_deref(),
        &settings,
    )
    .await?;
    let intents = snapshot_intents(ctx, tenant, project, workspace.head.as_deref()).await?;
    let author = marker
        .as_ref()
        .map(|entry| entry.author.clone())
        .unwrap_or_default();
    let marked_at = marker
        .as_ref()
        .map(|entry| entry.timestamp.clone())
        .unwrap_or_default();
    Ok(json!({
        "workspace": workspace.name,
        "author": author,
        "author_profile": marker.as_ref().and_then(|entry| entry.author_profile.clone()),
        "marked_at": marked_at,
        "head": workspace.head,
        "parent_workspace": workspace.parent_workspace,
        "intents": intents,
        "ci_status": merge_requirements.checks,
        "checks": checks,
        "reviewers": workspace.reviewers,
        "approved_by": approvals.iter().map(|approval| approval.author.clone()).collect::<Vec<_>>(),
        "approvals": approvals,
        "stale_approvals": stale_approvals,
        "merge_requirements": merge_requirements,
    }))
}

async fn snapshot_intents(
    ctx: &crate::request_context::AppRouteContext,
    tenant: &str,
    project: &str,
    head: Option<&str>,
) -> Result<Vec<serde_json::Value>> {
    let Some(head) = head else {
        return Ok(Vec::new());
    };
    validate_object_id(head)?;
    let store = bucket(&ctx.env)?;
    let bytes = r2_bytes(&store, &object_key(tenant, project, head)).await?;
    let snapshot: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|error| Error::RustError(format!("invalid snapshot payload: {error}")))?;
    Ok(snapshot["intents"].as_array().cloned().unwrap_or_default())
}

async fn workspace_exists(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    workspace: &str,
) -> Result<bool> {
    Ok(d1::workspace_states(database, tenant, project)
        .await?
        .into_iter()
        .any(|item| item.name == workspace))
}

fn normalize_review_state(value: Option<&str>) -> Result<&'static str> {
    match value.unwrap_or("comment") {
        "approve" | "approved" | "APPROVE" | "APPROVED" => Ok("approved"),
        "request_changes" | "changes_requested" | "REQUEST_CHANGES" | "CHANGES_REQUESTED" => {
            Ok("changes_requested")
        }
        "comment" | "COMMENT" => Ok("commented"),
        _ => Err(Error::RustError("invalid review state".to_string())),
    }
}

pub async fn reject_ready(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "workspaces:ready",
    )
    .await?;
    let workspace = param(&ctx, "workspace")?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace);
    let Some(state) = state else {
        return json_error(404, "workspace not found");
    };
    if workspace == "main" {
        return json_error(404, "workspace not found");
    }
    if !state.is_ready || state.status != "ready" {
        return json_error(409, "workspace is not ready");
    }
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| json!({}));
    d1::reject_workspace_ready(
        &database,
        &tenant,
        &project,
        &workspace,
        &sty_protocol::TokenPrincipal { user },
        body["reason"].as_str(),
    )
    .await?;
    Response::from_json(
        &json!({ "ok": true, "status": "rejected", "reason": body["reason"].clone() }),
    )
}
