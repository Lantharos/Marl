use sty_protocol::{
    ForkProjectRequest, ForkProjectResponse, ProjectSummary, SendWorkRequest, SendWorkResponse,
};
use worker::*;

use crate::support::{bucket, db, json_error, object_key, project_params, put_bytes, r2_bytes};
use crate::{check_project_write_capability, d1, require_auth};

pub(crate) async fn fork_project(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let body: ForkProjectRequest = req.json().await?;
    validate_fork_request(&body)?;
    let database = db(&ctx.env)?;
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    let visibility = d1::project_visibility(&database, &body.source_tenant, &body.source_project)
        .await?
        .ok_or_else(|| Error::RustError("source project not found".to_string()))?;
    if visibility != "public" {
        return json_error(403, "only public projects can be forked");
    }
    let source = d1::get_project(&database, &body.source_tenant, &body.source_project)
        .await?
        .ok_or_else(|| Error::RustError("source project not found".to_string()))?;
    let workspace = contribution_workspace(&body, &user)?;
    d1::create_fork_project(
        &database,
        &body.source_tenant,
        &body.source_project,
        &body.target_tenant,
        &body.target_project,
        workspace.as_deref(),
        &principal,
    )
    .await?;
    copy_project_objects(
        &ctx.env,
        &database,
        &body.source_tenant,
        &body.source_project,
        &body.target_tenant,
        &body.target_project,
    )
    .await?;
    let target = ProjectSummary {
        tenant: body.target_tenant,
        project: body.target_project,
        owner: user,
    };
    Response::from_json(&ForkProjectResponse {
        source,
        target,
        mode: body.mode,
        linked: workspace.is_some(),
        workspace,
    })
}

pub(crate) async fn send_work(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: SendWorkRequest = req.json().await?;
    validate_send_work_request(&body)?;
    let database = db(&ctx.env)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "contributor",
        "workspaces:write",
    )
    .await?;
    let fork = d1::project_fork(&database, &tenant, &project)
        .await?
        .ok_or_else(|| Error::RustError("project is not a contribution fork".to_string()))?;
    let head = d1::head(&database, &tenant, &project, &body.workspace)
        .await?
        .ok_or_else(|| Error::RustError("workspace has no head; sync it first".to_string()))?;
    copy_project_objects(
        &ctx.env,
        &database,
        &tenant,
        &project,
        &fork.source_tenant,
        &fork.source_project,
    )
    .await?;
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    d1::publish_fork_workspace(
        &database,
        &fork,
        body.title.trim(),
        body.message.trim(),
        &head,
        &principal,
    )
    .await?;
    let source = d1::get_project(&database, &fork.source_tenant, &fork.source_project)
        .await?
        .ok_or_else(|| Error::RustError("source project not found".to_string()))?;
    let fork_project = ProjectSummary {
        tenant,
        project,
        owner: user,
    };
    Response::from_json(&SendWorkResponse {
        source,
        fork: fork_project,
        workspace: fork.workspace,
        title: body.title,
        message: body.message,
        head,
    })
}

async fn copy_project_objects(
    env: &Env,
    database: &D1Database,
    source_tenant: &str,
    source_project: &str,
    target_tenant: &str,
    target_project: &str,
) -> Result<()> {
    let store = bucket(env)?;
    for object in d1::project_objects(database, source_tenant, source_project).await? {
        if d1::object_kind(database, target_tenant, target_project, &object.id)
            .await?
            .is_none()
        {
            let bytes = r2_bytes(&store, &object_key(source_tenant, source_project, &object.id))
                .await?;
            put_bytes(&store, &object_key(target_tenant, target_project, &object.id), bytes)
                .await?;
            d1::record_object(
                database,
                target_tenant,
                target_project,
                &object.id,
                &object.kind,
                object.size,
            )
            .await?;
        }
    }
    Ok(())
}

fn contribution_workspace(body: &ForkProjectRequest, user: &str) -> Result<Option<String>> {
    match body.mode.as_str() {
        "contribute" => {
            let workspace = body
                .workspace
                .clone()
                .unwrap_or_else(|| default_workspace(&body.target_tenant, &body.target_project, user));
            sty_protocol::validate_segment(&workspace)
                .map_err(|error| Error::RustError(error.to_string()))?;
            Ok(Some(workspace))
        }
        "detached" => {
            if body.workspace.is_some() {
                return Err(Error::RustError(
                    "workspace only applies to contribution forks".to_string(),
                ));
            }
            Ok(None)
        }
        _ => Err(Error::RustError(
            "fork mode must be contribute or detached".to_string(),
        )),
    }
}

fn validate_fork_request(body: &ForkProjectRequest) -> Result<()> {
    sty_protocol::validate_segment(&body.source_tenant)
        .map_err(|error| Error::RustError(error.to_string()))?;
    sty_protocol::validate_segment(&body.source_project)
        .map_err(|error| Error::RustError(error.to_string()))?;
    sty_protocol::validate_segment(&body.target_tenant)
        .map_err(|error| Error::RustError(error.to_string()))?;
    sty_protocol::validate_segment(&body.target_project)
        .map_err(|error| Error::RustError(error.to_string()))?;
    Ok(())
}

fn validate_send_work_request(body: &SendWorkRequest) -> Result<()> {
    sty_protocol::validate_segment(&body.workspace)
        .map_err(|error| Error::RustError(error.to_string()))?;
    if body.title.trim().is_empty() {
        return Err(Error::RustError("sendwork title is required".to_string()));
    }
    Ok(())
}

fn default_workspace(target_tenant: &str, target_project: &str, user: &str) -> String {
    let base = format!("fork-{target_tenant}-{target_project}-{user}");
    let normalized = base
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    normalized.trim_matches('-').to_string()
}
