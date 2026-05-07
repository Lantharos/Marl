pub(crate) async fn project_issues(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "issues:read").await?;
    let mut issues = d1::list_issues(&database, &tenant, &project).await?;
    let state = req.url()?.query_pairs().find_map(|(k, v)| (k == "state").then(|| v.to_string()));
    if let Some(state) = state {
        issues.retain(|issue| issue.state == state || issue.status == state);
    }
    let envelope = paginate_vec(req.url()?, issues);
    Response::from_json(&envelope)
}

pub(crate) async fn create_issue(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: CreateIssueRequest = req.json().await?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "issues:write").await?;
    let issue = d1::create_issue(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }, &body.title, &body.body, &body.labels, body.assignee.as_deref()).await?;
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
    let status = body.state.or(body.status).unwrap_or_else(|| "open".to_string());
    let issue = d1::update_issue_status(&database, &tenant, &project, &issue_id, &status).await?;
    let _ = crate::developer::emit_project_event(&ctx,
        &tenant,
        &project,
        "issue.updated",
        serde_json::json!({ "issue": &issue, "actor": user }),
    );
    Response::from_json(&issue)
}

pub(crate) async fn close_issue(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    set_issue_state(req, ctx, "closed").await
}

pub(crate) async fn reopen_issue(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    set_issue_state(req, ctx, "open").await
}

pub(crate) async fn set_issue_state(req: Request, ctx: crate::request_context::AppRouteContext, state: &str) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "issues:write").await?;
    let issue = d1::update_issue_status(&database, &tenant, &project, &issue_id, state).await?;
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
    let comment = d1::create_comment(&database, &tenant, &project, &issue_id, &sty_protocol::TokenPrincipal { user }, &body.body).await?;
    Response::from_json(&comment)
}
