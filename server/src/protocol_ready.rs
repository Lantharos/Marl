use serde_json::json;
use sty_protocol::OkResponse;
use worker::*;

use crate::support::{db, json_error, paginate_vec, param, project_params};
use crate::{
    check_project_read_capability, check_project_write_capability, d1, optional_auth, require_auth,
};

pub async fn list_ready(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_read_capability(
        &ctx.env,
        &database,
        &tenant,
        &project,
        user.as_deref(),
        "workspaces:read",
    )
    .await?;
    let ready = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .filter(|workspace| workspace.is_ready && workspace.name != "main")
        .map(|workspace| {
            json!({
                "workspace": workspace.name,
                "author": "",
                "marked_at": "",
                "head": workspace.head,
                "intents": [],
                "ci_status": null,
                "reviewers": [],
                "approved_by": [],
            })
        })
        .collect::<Vec<_>>();
    Response::from_json(&paginate_vec(req.url()?, ready))
}

pub async fn get_ready(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_project_read_capability(
        &ctx.env,
        &database,
        &tenant,
        &project,
        user.as_deref(),
        "workspaces:read",
    )
    .await?;
    let state = d1::workspace_states(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|item| item.name == workspace && item.is_ready);
    match state {
        Some(item) => Response::from_json(&json!({
            "workspace": item.name,
            "author": "",
            "marked_at": "",
            "head": item.head,
            "intents": [],
            "ci_status": null,
            "reviewers": [],
            "approved_by": [],
        })),
        None => json_error(404, "ready workspace not found"),
    }
}

pub async fn unmark_ready(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_project_write_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "workspaces:ready",
    )
    .await?;
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

pub async fn reject_ready(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
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
