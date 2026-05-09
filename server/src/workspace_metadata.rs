use serde_json::json;
use worker::*;

use crate::support::{db, json_error, param, project_params};
use crate::{check_project_write_capability, d1, require_auth};

pub(crate) async fn update_workspace_metadata(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await.unwrap_or_default();
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "workspaces:write").await?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace);
    let Some(state) = state else {
        return json_error(404, "workspace not found");
    };
    if body.get("locked").is_some() && body["locked"].as_bool().unwrap_or(state.locked) != state.locked {
        check_project_write_capability(&database, &tenant, &project, &user, "maintainer", "workspaces:write").await?;
    }
    let reviewers = body
        .get("reviewers")
        .and_then(|value| value.as_array())
        .map(|items| clean_string_list(items, 15))
        .unwrap_or_else(|| state.reviewers.clone());
    let assignees = body
        .get("assignees")
        .and_then(|value| value.as_array())
        .map(|items| clean_string_list(items, 10))
        .unwrap_or_else(|| state.assignees.clone());
    let linked_issues = body
        .get("linked_issues")
        .and_then(|value| value.as_array())
        .map(|items| clean_string_list(items, 10))
        .unwrap_or_else(|| state.linked_issues.clone());
    let milestone = if body.get("milestone").is_some() {
        body["milestone"]
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    } else {
        state.milestone.clone()
    };
    let locked = body
        .get("locked")
        .and_then(|value| value.as_bool())
        .unwrap_or(state.locked);
    d1::set_workspace_metadata(
        &database,
        &tenant,
        &project,
        &workspace,
        &reviewers,
        &assignees,
        milestone.as_deref(),
        &linked_issues,
        locked,
    )
    .await?;
    Response::from_json(&json!({
        "reviewers": reviewers,
        "assignees": assignees,
        "milestone": milestone,
        "linked_issues": linked_issues,
        "locked": locked
    }))
}

fn clean_string_list(items: &[serde_json::Value], limit: usize) -> Vec<String> {
    items
        .iter()
        .filter_map(|item| item.as_str())
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .take(limit)
        .collect()
}
