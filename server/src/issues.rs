pub(crate) async fn project_issues(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "issues:read").await?;
    let mut issues = d1::list_issues(&database, &tenant, &project).await?;
    let url = req.url()?;
    let state = url.query_pairs().find_map(|(k, v)| (k == "state").then(|| v.to_string()));
    let label = url.query_pairs().find_map(|(k, v)| (k == "label").then(|| v.to_string()));
    let assignee = url.query_pairs().find_map(|(k, v)| (k == "assignee").then(|| v.to_string()));
    let issue_type = url
        .query_pairs()
        .find_map(|(k, v)| (k == "type" || k == "issue_type").then(|| v.to_string()));
    let query = url.query_pairs().find_map(|(k, v)| (k == "q").then(|| v.to_string().to_ascii_lowercase()));
    if let Some(state) = state {
        if state != "all" {
            issues.retain(|issue| issue.state == state || issue.status == state);
        }
    }
    if let Some(label) = label {
        issues.retain(|issue| issue.labels.iter().any(|item| item == &label));
    }
    if let Some(assignee) = assignee {
        issues.retain(|issue| issue.assignees.iter().any(|item| item == &assignee));
    }
    if let Some(issue_type) = issue_type {
        issues.retain(|issue| issue.issue_type.as_deref() == Some(issue_type.as_str()));
    }
    if let Some(query) = query {
        if !query.trim().is_empty() {
            issues.retain(|issue| {
                let haystack = format!(
                    "{} {} {} {} {}",
                    issue.title,
                    issue.body,
                    issue.labels.join(" "),
                    issue.assignees.join(" "),
                    issue.issue_type.as_deref().unwrap_or("")
                )
                .to_ascii_lowercase();
                haystack.contains(&query)
            });
        }
    }
    let envelope = paginate_vec(url, issues);
    Response::from_json(&envelope)
}

pub(crate) async fn create_issue(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: CreateIssueRequest = req.json().await?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "issues:write").await?;
    let mut assignees = body.assignees;
    if let Some(assignee) = body.assignee {
        if !assignees.contains(&assignee) {
            assignees.push(assignee);
        }
    }
    let issue = d1::create_issue(
        &database,
        &tenant,
        &project,
        &sty_protocol::TokenPrincipal { user: user.clone() },
        &body.title,
        &body.body,
        &body.labels,
        &assignees,
        body.milestone.as_deref(),
        sanitize_issue_type(body.issue_type.as_deref())?,
    ).await?;
    let _ = crate::developer::emit_project_event(&ctx,
        &tenant,
        &project,
        "issue.created",
        serde_json::json!({ "issue": &issue, "actor": user }),
    );
    Response::from_json(&issue)
}

pub(crate) async fn get_issue(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "issues:read").await?;
    let issue = d1::list_issues(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id);
    match issue {
        Some(issue) => Response::from_json(&issue),
        None => json_error(404, "issue not found"),
    }
}

pub(crate) async fn update_issue(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let body: UpdateIssueRequest = req.json().await?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "issues:write").await?;
    if body.locked.is_some() || body.pinned.is_some() {
        check_project_write_capability(&database, &tenant, &project, &user, "maintainer", "issues:write").await?;
    }
    let before = d1::list_issues(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id)
        .ok_or_else(|| Error::RustError("issue not found".into()))?;
    let status = body.state.or(body.status);
    let milestone = body.milestone.as_ref().map(|value| value.as_deref());
    let issue_type = body
        .issue_type
        .as_ref()
        .map(|value| sanitize_issue_type(value.as_deref()))
        .transpose()?;
    let workspace = body.workspace.as_ref().map(|value| value.as_deref());
    let issue = d1::update_issue(
        &database,
        &tenant,
        &project,
        &issue_id,
        body.title.as_deref(),
        body.body.as_deref(),
        status.as_deref(),
        body.labels.as_deref(),
        body.assignees.as_deref(),
        milestone,
        issue_type,
        workspace,
        body.locked,
        body.pinned,
    ).await?;
    record_issue_metadata_activity(&database, &tenant, &project, &issue.id, &user, &before, &issue).await?;
    let _ = crate::developer::emit_project_event(&ctx,
        &tenant,
        &project,
        "issue.updated",
        serde_json::json!({ "issue": &issue, "actor": user }),
    );
    Response::from_json(&issue)
}

fn sanitize_issue_type(value: Option<&str>) -> Result<Option<&str>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    match value {
        "bug" | "feature" | "task" => Ok(Some(value)),
        _ => Err(worker::Error::RustError("invalid issue type".into())),
    }
}

pub(crate) async fn close_issue(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    set_issue_state(req, ctx, "closed").await
}

pub(crate) async fn reopen_issue(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    set_issue_state(req, ctx, "open").await
}

pub(crate) async fn set_issue_state(mut req: Request, ctx: crate::request_context::AppRouteContext, state: &str) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "issues:write").await?;
    let body: serde_json::Value = req.json().await.unwrap_or_default();
    let state_reason = if state == "closed" {
        match body["reason"].as_str().unwrap_or("completed") {
            "not_planned" => Some("not_planned"),
            "duplicate" => Some("duplicate"),
            _ => Some("completed"),
        }
    } else {
        None
    };
    let issue = d1::update_issue_status(&database, &tenant, &project, &issue_id, state, state_reason).await?;
    let message = if state == "open" {
        "reopened this issue".to_string()
    } else {
        match state_reason.unwrap_or("completed") {
            "not_planned" => "closed this issue as not planned".to_string(),
            "duplicate" => "closed this issue as duplicate".to_string(),
            _ => "closed this issue".to_string(),
        }
    };
    record_issue_activity(&database, &tenant, &project, &issue.id, &user, &message, Some("state")).await?;
    let _ = crate::developer::emit_project_event(&ctx,
        &tenant,
        &project,
        "issue.updated",
        serde_json::json!({ "issue": &issue, "actor": user }),
    );
    Response::from_json(&issue)
}

pub(crate) async fn assign_issue(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let body: serde_json::Value = req.json().await?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "issues:write").await?;
    let assignees = issue_string_list(&body, "assignees", "user");
    let issue = d1::add_issue_assignees(&database, &tenant, &project, &issue_id, &assignees).await?;
    Response::from_json(&issue)
}

pub(crate) async fn label_issue(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let body: serde_json::Value = req.json().await?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "issues:write").await?;
    let labels = issue_string_list(&body, "labels", "label");
    let issue = d1::add_issue_labels(&database, &tenant, &project, &issue_id, &labels).await?;
    Response::from_json(&issue)
}

pub(crate) fn issue_string_list(body: &serde_json::Value, list_key: &str, single_key: &str) -> Vec<String> {
    body[list_key]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                .collect()
        })
        .or_else(|| {
            body["users"].as_array().map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToOwned::to_owned))
                    .collect()
            })
        })
        .or_else(|| body[single_key].as_str().map(|item| vec![item.to_string()]))
        .unwrap_or_default()
}

pub(crate) async fn issue_comments(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "issues:read").await?;
    let comments = d1::list_comments(&database, &tenant, &project, &issue_id).await?;
    Response::from_json(&CommentsResponse { comments })
}

pub(crate) async fn create_comment(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let body: CreateCommentRequest = req.json().await?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "issues:write").await?;
    let issue = d1::list_issues(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id)
        .ok_or_else(|| Error::RustError("issue not found".into()))?;
    if issue.locked {
        check_project_write_capability(&database, &tenant, &project, &user, "maintainer", "issues:write").await?;
    }
    let comment = d1::create_comment(
        &database,
        &tenant,
        &project,
        &issue.id,
        &sty_protocol::TokenPrincipal { user },
        &body.body,
        Some("comment"),
        body.target_id.as_deref(),
    ).await?;
    Response::from_json(&comment)
}

pub(crate) async fn transfer_issue(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let body: serde_json::Value = req.json().await?;
    let target_tenant = body["tenant"].as_str().or_else(|| body["target_tenant"].as_str()).unwrap_or("").trim();
    let target_project = body["project"].as_str().or_else(|| body["target_project"].as_str()).unwrap_or("").trim();
    if target_tenant.is_empty() || target_project.is_empty() {
        return json_error(400, "target tenant and project are required");
    }
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "maintainer", "issues:write").await?;
    check_project_write_capability(&database, target_tenant, target_project, &user, "contributor", "issues:write").await?;
    let before = d1::list_issues(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id)
        .ok_or_else(|| Error::RustError("issue not found".into()))?;
    let issue = d1::transfer_issue(&database, &tenant, &project, &before.id, target_tenant, target_project).await?;
    record_issue_activity(
        &database,
        target_tenant,
        target_project,
        &issue.id,
        &user,
        &format!("transferred this issue from {tenant}/{project}"),
        Some("transfer"),
    )
    .await?;
    Response::from_json(&issue)
}

pub(crate) async fn delete_issue(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "maintainer", "issues:write").await?;
    if d1::delete_issue(&database, &tenant, &project, &issue_id).await? {
        Response::from_json(&serde_json::json!({ "deleted": true }))
    } else {
        json_error(404, "issue not found")
    }
}

async fn record_issue_metadata_activity(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    actor: &str,
    before: &sty_protocol::Issue,
    after: &sty_protocol::Issue,
) -> Result<()> {
    for message in issue_metadata_messages(before, after) {
        record_issue_activity(db, tenant, project, issue_id, actor, &message, Some("metadata")).await?;
    }
    Ok(())
}

async fn record_issue_activity(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    issue_id: &str,
    actor: &str,
    message: &str,
    target_id: Option<&str>,
) -> Result<()> {
    d1::create_comment(
        db,
        tenant,
        project,
        issue_id,
        &sty_protocol::TokenPrincipal { user: actor.to_string() },
        message,
        Some("activity"),
        target_id,
    )
    .await?;
    Ok(())
}

fn issue_metadata_messages(before: &sty_protocol::Issue, after: &sty_protocol::Issue) -> Vec<String> {
    let mut messages = Vec::new();
    if before.title != after.title {
        messages.push("changed the title".to_string());
    }
    if before.body != after.body {
        messages.push("edited the description".to_string());
    }
    for label in after.labels.iter().filter(|label| !before.labels.contains(label)) {
        messages.push(format!("added the label {label}"));
    }
    for label in before.labels.iter().filter(|label| !after.labels.contains(label)) {
        messages.push(format!("removed the label {label}"));
    }
    if before.assignees != after.assignees {
        messages.push("updated assignees".to_string());
    }
    if before.milestone != after.milestone {
        match after.milestone.as_deref() {
            Some(value) => messages.push(format!("set the milestone to {value}")),
            None => messages.push("cleared the milestone".to_string()),
        }
    }
    if before.issue_type != after.issue_type {
        match after.issue_type.as_deref() {
            Some(value) => messages.push(format!("set the issue type to {value}")),
            None => messages.push("cleared the issue type".to_string()),
        }
    }
    if before.workspace != after.workspace {
        match (&before.workspace, &after.workspace) {
            (None, Some(value)) => messages.push(format!("linked workspace {value}")),
            (Some(_), None) => messages.push("unlinked the workspace".to_string()),
            (Some(previous), Some(next)) => messages.push(format!("changed the linked workspace from {previous} to {next}")),
            _ => {}
        }
    }
    if before.locked != after.locked {
        messages.push(if after.locked { "locked the conversation" } else { "unlocked the conversation" }.to_string());
    }
    if before.pinned != after.pinned {
        messages.push(if after.pinned { "pinned this issue" } else { "unpinned this issue" }.to_string());
    }
    messages
}
