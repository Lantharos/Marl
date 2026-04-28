use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::json;
use sha2::{Digest, Sha256};
use sty_protocol::{
    ChunkCompleteRequest, CommentsResponse, CompareRequest, CompareResponse, CreateCommentRequest,
    CreateIssueRequest, DevTokenRequest, DownloadRequest, DownloadResponse, HeadResponse,
    HeadUpdateRequest, HistoryResponse, LogHistoryRequest, MeResponse, MissingRequest,
    MissingResponse, OkResponse, ObjectFileResponse, ProjectDetailResponse, ProjectSummary,
    ProjectTreeResponse, RemoteObject, SessionExchangeRequest, StarResponse, TokenResponse,
    TreeEntryInfo, UpdateIssueRequest, UpdateSettingsRequest, UploadRequest, WorkspaceStateResponse,
    WorkspaceSummary,
};
use worker::*;

mod auth;
pub(crate) mod d1;
mod protocol;
mod support;

use auth::{dev_tokens_enabled, verify_ave_id_token};
use protocol::*;
use support::{
    apply_cors, bucket, db, decode_base64, json_error, object_chunk_key, object_key,
    param, preflight_response, project_params, put_bytes, required_header,
    required_usize_header, r2_bytes, validate_object, validate_object_metadata,
};

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    if req.method() == Method::Options {
        return preflight_response(&req);
    }
    let request = req.clone()?;
    let mut response = Router::new()
        .post_async("/v1/auth/check", auth_check)
        .get_async("/v1/capabilities", capabilities)
        .post_async("/v1/dev/tokens", dev_token)
        .post_async("/v1/session/exchange", exchange_session)
        .get_async("/v1/me", me)
        .post_async("/v1/orgs", create_org)
        .get_async("/v1/projects", list_projects)
        .post_async("/v1/tenants/:tenant/projects/:project", create_project)
        .get_async("/v1/tenants/:tenant/projects/:project", project_detail)
        .get_async("/v1/tenants/:tenant/projects/:project/workspaces", list_workspaces)
        .get_async("/v1/tenants/:tenant/projects/:project/tree", project_tree)
        .get_async("/v1/tenants/:tenant/projects/:project/files/:path", project_file)
        .get_async("/v1/tenants/:tenant/projects/:project/issues", project_issues)
        .post_async("/v1/tenants/:tenant/projects/:project/issues", create_issue)
        .get_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id", get_issue)
        .patch_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id", update_issue)
        .post_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id/close", close_issue)
        .post_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id/reopen", reopen_issue)
        .post_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id/assignees", assign_issue)
        .post_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id/labels", label_issue)
        .get_async("/v1/tenants/:tenant/projects/:project/labels", list_labels)
        .post_async("/v1/tenants/:tenant/projects/:project/labels", create_label)
        .delete_async("/v1/tenants/:tenant/projects/:project/labels/:item_id", delete_protocol_item)
        .get_async("/v1/tenants/:tenant/projects/:project/milestones", list_milestones)
        .post_async("/v1/tenants/:tenant/projects/:project/milestones", create_milestone)
        .get_async("/v1/tenants/:tenant/projects/:project/milestones/:item_id", get_protocol_item)
        .post_async("/v1/tenants/:tenant/projects/:project/milestones/:item_id/close", close_protocol_item)
        .get_async("/v1/tenants/:tenant/projects/:project/ready", list_ready)
        .get_async("/v1/tenants/:tenant/projects/:project/ready/:workspace", get_ready)
        .delete_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/ready", unmark_ready)
        .post_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/reject", reject_ready)
        .get_async("/v1/tenants/:tenant/projects/:project/comments", list_protocol_comments)
        .post_async("/v1/tenants/:tenant/projects/:project/comments", create_protocol_comment)
        .delete_async("/v1/tenants/:tenant/projects/:project/comments/:item_id", delete_protocol_item)
        .get_async("/v1/tenants/:tenant/projects/:project/comments/:item_id/reactions", list_reactions)
        .post_async("/v1/tenants/:tenant/projects/:project/comments/:item_id/reactions", add_reaction)
        .delete_async("/v1/tenants/:tenant/projects/:project/comments/:item_id/reactions/:reaction", delete_reaction)
        .get_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id/reactions", list_reactions)
        .post_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id/reactions", add_reaction)
        .delete_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id/reactions/:reaction", delete_reaction)
        .get_async("/v1/tenants/:tenant/projects/:project/hooks", list_hooks)
        .post_async("/v1/tenants/:tenant/projects/:project/hooks", create_hook)
        .delete_async("/v1/tenants/:tenant/projects/:project/hooks/:item_id", delete_protocol_item)
        .post_async("/v1/tenants/:tenant/projects/:project/hooks/:item_id/test", test_protocol_item)
        .get_async("/v1/tenants/:tenant/projects/:project/webhooks", list_webhooks)
        .post_async("/v1/tenants/:tenant/projects/:project/webhooks", create_webhook)
        .delete_async("/v1/tenants/:tenant/projects/:project/webhooks/:item_id", delete_protocol_item)
        .post_async("/v1/tenants/:tenant/projects/:project/webhooks/:item_id/test", test_protocol_item)
        .get_async("/v1/tenants/:tenant/projects/:project/search", search_project)
        .get_async("/v1/tenants/:tenant/projects/:project/releases", list_releases)
        .post_async("/v1/tenants/:tenant/projects/:project/releases", create_release)
        .get_async("/v1/tenants/:tenant/projects/:project/releases/:item_id", get_protocol_item)
        .get_async("/v1/tenants/:tenant/projects/:project/keys", list_keys)
        .post_async("/v1/tenants/:tenant/projects/:project/keys", create_key)
        .delete_async("/v1/tenants/:tenant/projects/:project/keys/:item_id", delete_protocol_item)
        .get_async("/v1/tenants/:tenant/projects/:project/snapshots/verify", verify_all_snapshots)
        .get_async("/v1/tenants/:tenant/projects/:project/snapshots/:item_id/verify", verify_snapshot)
        .get_async("/v1/tenants/:tenant/projects/:project/audit", list_audit)
        .get_async("/v1/tenants/:tenant/projects/:project/users/me", profile_me)
        .get_async("/v1/tenants/:tenant/projects/:project/users/:item_id", profile_user)
        .get_async("/v1/tenants/:tenant/projects/:project/ssh-keys", list_ssh_keys)
        .post_async("/v1/tenants/:tenant/projects/:project/ssh-keys", create_ssh_key)
        .delete_async("/v1/tenants/:tenant/projects/:project/ssh-keys/:item_id", delete_protocol_item)
        .get_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id/comments", issue_comments)
        .post_async("/v1/tenants/:tenant/projects/:project/issues/:issue_id/comments", create_comment)
        .get_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/head", get_head)
        .put_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/head", update_head)
        .get_async("/v1/tenants/:tenant/projects/:project/history", project_history)
        .get_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/history", workspace_history)
        .post_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/history", log_history)
        .get_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/merge-preview", merge_preview)
        .get_async("/v1/tenants/:tenant/projects/:project/history/:entry_id", history_entry)
        .post_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/ready", mark_ready)
        .post_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/merge", merge_workspace)
        .post_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/parent", set_parent)
        .post_async("/v1/tenants/:tenant/projects/:project/workspaces/:workspace/compare", compare)
        .get_async("/v1/tenants/:tenant/projects/:project/settings", get_settings)
        .patch_async("/v1/tenants/:tenant/projects/:project/settings", update_settings)
        .post_async("/v1/tenants/:tenant/projects/:project/star", star_project)
        .delete_async("/v1/tenants/:tenant/projects/:project/star", unstar_project)
        .post_async("/v1/tenants/:tenant/projects/:project/objects/missing", missing)
        .post_async("/v1/tenants/:tenant/projects/:project/objects/check", missing)
        .post_async("/v1/tenants/:tenant/projects/:project/objects/upload", upload)
        .post_async("/v1/tenants/:tenant/projects/:project/objects", upload)
        .get_async("/v1/tenants/:tenant/projects/:project/objects/:object", get_object)
        .put_async("/v1/tenants/:tenant/projects/:project/objects/:object/chunks/:chunk", upload_chunk)
        .post_async("/v1/tenants/:tenant/projects/:project/objects/:object/complete", complete_chunked_upload)
        .post_async("/v1/tenants/:tenant/projects/:project/objects/download", download)
        .get_async("/v1/tenants/:tenant/projects/:project/tags", list_tags)
        .post_async("/v1/tenants/:tenant/projects/:project/tags", create_tag)
        .get_async("/v1/tenants/:tenant/projects/:project/tags/:item_id", get_protocol_item)
        .run(req, env)
        .await?;
    apply_cors(&request, &mut response)?;
    Ok(response)
}

async fn auth_check(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    Response::from_json(&json!({ "ok": true, "user": user }))
}

async fn capabilities(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let _ = optional_auth(&req, &ctx.env).await?;
    Response::from_json(&sty_protocol::protocol_capabilities())
}

async fn dev_token(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    if !dev_tokens_enabled(&ctx.env) {
        return json_error(404, "not found");
    }
    let body: DevTokenRequest = req.json().await?;
    sty_protocol::validate_segment(&body.user).map_err(|e| Error::RustError(e.to_string()))?;
    let db = db(&ctx.env)?;
    let token = d1::add_token(&db, &body.user).await?;
    Response::from_json(&TokenResponse { token })
}

async fn exchange_session(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let body: SessionExchangeRequest = req.json().await?;
    if body.id_token.trim().is_empty() {
        return json_error(400, "missing Ave id token");
    }
    let user = match verify_ave_id_token(&ctx.env, &body.id_token).await {
        Ok(user) => user,
        Err(e) => return json_error(401, &e.to_string()),
    };
    let database = db(&ctx.env)?;
    let token = d1::add_token(&database, &user).await?;
    Response::from_json(&TokenResponse { token })
}

async fn me(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let database = db(&ctx.env)?;
    let tenants = d1::tenants(&database, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    Response::from_json(&MeResponse { user, tenants })
}

async fn create_org(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let body: serde_json::Value = req.json().await?;
    let name = body["name"].as_str().unwrap_or_default();
    sty_protocol::validate_segment(name).map_err(|e| Error::RustError(e.to_string()))?;
    let database = db(&ctx.env)?;
    let tenant = d1::create_org(&database, name, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&tenant)
}

async fn list_projects(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let database = db(&ctx.env)?;
    let projects = d1::projects(&database, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&json!({ "projects": projects }))
}

async fn create_project(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn project_detail(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let project_info = d1::get_project(&database, &tenant, &project).await?;
    let owner = project_info.map(|p| p.owner).unwrap_or_default();
    let states = d1::workspace_states(&database, &tenant, &project).await?;
    let workspaces: Vec<WorkspaceSummary> = states
        .into_iter()
        .map(|s| WorkspaceSummary {
            name: s.name,
            head: s.head,
        })
        .collect();
    Response::from_json(&ProjectDetailResponse {
        project: ProjectSummary {
            tenant: tenant.clone(),
            project: project.clone(),
            owner,
        },
        workspaces,
    })
}

async fn list_workspaces(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let workspaces = d1::workspace_states(&database, &tenant, &project).await?;
    Response::from_json(&WorkspaceStateResponse { workspaces })
}

async fn project_tree(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let workspace = req.url()?.query_pairs().find_map(|(k, v)| {
        (k == "workspace").then(|| v.to_string())
    }).unwrap_or_else(|| "main".to_string());
    let snapshot_param = req.url()?.query_pairs().find_map(|(k, v)| {
        (k == "snapshot").then(|| v.to_string())
    });
    let head_id = if let Some(snapshot) = snapshot_param {
        snapshot
    } else {
        let head = d1::head(&database, &tenant, &project, &workspace).await?;
        match head {
            Some(h) => h,
            None => {
                return Response::from_json(&ProjectTreeResponse {
                    workspace: workspace.clone(),
                    head: None,
                    root_tree: None,
                    entries: Vec::new(),
                });
            }
        }
    };
    let store = bucket(&ctx.env)?;
    let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &head_id)).await?;
    let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
    let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
    let mut entries = Vec::new();
    walk_tree(&store, &tenant, &project, "", &root_tree, &mut entries).await?;
    Response::from_json(&ProjectTreeResponse {
        workspace: workspace.clone(),
        head: Some(head_id.clone()),
        root_tree: Some(root_tree),
        entries,
    })
}

async fn project_file(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let path = param(&ctx, "path")?;
    let workspace = req.url()?.query_pairs().find_map(|(k, v)| {
        (k == "workspace").then(|| v.to_string())
    }).unwrap_or_else(|| "main".to_string());
    let snapshot_param = req.url()?.query_pairs().find_map(|(k, v)| {
        (k == "snapshot").then(|| v.to_string())
    });
    let head_id = if let Some(snapshot) = snapshot_param {
        snapshot
    } else {
        let head = d1::head(&database, &tenant, &project, &workspace).await?;
        match head {
            Some(h) => h,
            None => return json_error(404, "workspace has no head"),
        }
    };
    let store = bucket(&ctx.env)?;
    let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &head_id)).await?;
    let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
    let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
    let Some(entry) = resolve_tree_path(&store, &tenant, &project, &root_tree, &path).await? else {
        return json_error(404, "file not found");
    };
    if entry.entry_type != "blob" {
        return json_error(400, "path is not a file");
    }
    let bytes = r2_bytes(&store, &object_key(&tenant, &project, &entry.id)).await?;
    let text = String::from_utf8(bytes).ok();
    Response::from_json(&ObjectFileResponse {
        path: path.clone(),
        id: entry.id.clone(),
        binary: text.is_none(),
        text,
    })
}

async fn project_issues(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let mut issues = d1::list_issues(&database, &tenant, &project).await?;
    let state = req.url()?.query_pairs().find_map(|(k, v)| (k == "state").then(|| v.to_string()));
    if let Some(state) = state {
        issues.retain(|issue| issue.state == state || issue.status == state);
    }
    let envelope = paginate_vec(req.url()?, issues);
    Response::from_json(&envelope)
}

async fn create_issue(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: CreateIssueRequest = req.json().await?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let issue = d1::create_issue(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }, &body.title, &body.body, &body.labels, body.assignee.as_deref()).await?;
    Response::from_json(&issue)
}

async fn get_issue(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let issue = d1::list_issues(&database, &tenant, &project)
        .await?
        .into_iter()
        .find(|issue| issue.id == issue_id || issue.number.to_string() == issue_id);
    match issue {
        Some(issue) => Response::from_json(&issue),
        None => json_error(404, "issue not found"),
    }
}

async fn update_issue(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let body: UpdateIssueRequest = req.json().await?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let status = body.state.or(body.status).unwrap_or_else(|| "open".to_string());
    let issue = d1::update_issue_status(&database, &tenant, &project, &issue_id, &status).await?;
    Response::from_json(&issue)
}

async fn close_issue(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    set_issue_state(req, ctx, "closed").await
}

async fn reopen_issue(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    set_issue_state(req, ctx, "open").await
}

async fn set_issue_state(req: Request, ctx: RouteContext<()>, state: &str) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    let issue = d1::update_issue_status(&database, &tenant, &project, &issue_id, state).await?;
    Response::from_json(&issue)
}

async fn assign_issue(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let body: serde_json::Value = req.json().await?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    let assignees = issue_string_list(&body, "assignees", "user");
    let issue = d1::add_issue_assignees(&database, &tenant, &project, &issue_id, &assignees).await?;
    Response::from_json(&issue)
}

async fn label_issue(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let body: serde_json::Value = req.json().await?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    let labels = issue_string_list(&body, "labels", "label");
    let issue = d1::add_issue_labels(&database, &tenant, &project, &issue_id, &labels).await?;
    Response::from_json(&issue)
}

fn issue_string_list(body: &serde_json::Value, list_key: &str, single_key: &str) -> Vec<String> {
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

async fn issue_comments(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let comments = d1::list_comments(&database, &tenant, &project, &issue_id).await?;
    Response::from_json(&CommentsResponse { comments })
}

async fn create_comment(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let issue_id = param(&ctx, "issue_id")?;
    let body: CreateCommentRequest = req.json().await?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let comment = d1::create_comment(&database, &tenant, &project, &issue_id, &sty_protocol::TokenPrincipal { user }, &body.body).await?;
    Response::from_json(&comment)
}

async fn get_head(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let workspace = param(&ctx, "workspace")?;
    let head = d1::head(&database, &tenant, &project, &workspace).await?;
    Response::from_json(&HeadResponse { head })
}

async fn update_head(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: HeadUpdateRequest = req.json().await?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let workspace = param(&ctx, "workspace")?;
    let ok = d1::update_head(&database, &tenant, &project, &workspace, body.expected_head.as_deref(), &body.new_head).await?;
    if ok {
        Response::from_json(&OkResponse { ok: true })
    } else {
        json_error(409, "workspace head changed")
    }
}

async fn workspace_history(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let entries = d1::workspace_history(&database, &tenant, &project, &workspace).await?;
    Response::from_json(&HistoryResponse { entries })
}

async fn project_history(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let entries = d1::project_history(&database, &tenant, &project).await?;
    Response::from_json(&HistoryResponse { entries })
}

async fn history_entry(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let entry_id = param(&ctx, "entry_id")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let entry = d1::get_history_entry(&database, &tenant, &project, &entry_id).await?;
    match entry {
        Some(e) => Response::from_json(&e),
        None => json_error(404, "history entry not found"),
    }
}

async fn log_history(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: LogHistoryRequest = req.json().await?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    d1::log_history(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }, &body.kind, &body.message, body.snapshot_id.as_deref()).await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn mark_ready(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    d1::mark_workspace_ready(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn merge_workspace(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    d1::merge_workspace(&database, &tenant, &project, &workspace, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn merge_preview(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
    let states = d1::workspace_states(&database, &tenant, &project).await?;
    let ws = states.into_iter().find(|s| s.name == workspace)
        .ok_or_else(|| Error::RustError("workspace not found".to_string()))?;
    let parent = ws.parent_workspace.as_ref()
        .ok_or_else(|| Error::RustError("workspace has no parent".to_string()))?;
    let head = d1::head(&database, &tenant, &project, &workspace).await?;
    let parent_head = d1::head(&database, &tenant, &project, parent).await?;
    let store = bucket(&ctx.env)?;
    let mut current_entries = Vec::new();
    if let Some(h) = head {
        let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &h)).await?;
        let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
        walk_tree(&store, &tenant, &project, "", &root_tree, &mut current_entries).await?;
    }
    let mut parent_entries = Vec::new();
    if let Some(h) = parent_head {
        let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &h)).await?;
        let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let root_tree = snapshot["root_tree"].as_str().unwrap_or_default().to_string();
        walk_tree(&store, &tenant, &project, "", &root_tree, &mut parent_entries).await?;
    }
    let current_map: std::collections::HashMap<String, String> = current_entries.into_iter().filter(|e| e.entry_type == "blob").map(|e| (e.path, e.id)).collect();
    let parent_map: std::collections::HashMap<String, String> = parent_entries.into_iter().filter(|e| e.entry_type == "blob").map(|e| (e.path, e.id)).collect();
    let mut files = Vec::new();
    for (path, id) in &current_map {
        if !parent_map.contains_key(path) {
            files.push(sty_protocol::ChangedFile { path: path.clone(), change_type: "added".to_string(), old_id: None, new_id: Some(id.clone()) });
        } else if parent_map.get(path) != Some(id) {
            files.push(sty_protocol::ChangedFile { path: path.clone(), change_type: "modified".to_string(), old_id: parent_map.get(path).cloned(), new_id: Some(id.clone()) });
        }
    }
    for (path, id) in &parent_map {
        if !current_map.contains_key(path) {
            files.push(sty_protocol::ChangedFile { path: path.clone(), change_type: "deleted".to_string(), old_id: Some(id.clone()), new_id: None });
        }
    }
    Response::from_json(&sty_protocol::MergePreviewResponse { files })
}

async fn set_parent(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: serde_json::Value = req.json().await?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let parent = body["parent_workspace"].as_str();
    d1::set_parent_workspace(&database, &tenant, &project, &workspace, parent).await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn compare(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let workspace = param(&ctx, "workspace")?;
    let body: CompareRequest = req.json().await?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let remote_head = d1::head(&database, &tenant, &project, &workspace).await?;
    let relation = compare_relation(&ctx.env, &tenant, &project, body.local_head.as_deref(), remote_head.as_deref()).await?;
    Response::from_json(&CompareResponse { remote_head, relation })
}

async fn get_settings(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    d1::ensure_project(&database, &tenant, &project, &principal).await?;
    let settings = d1::project_settings(&database, &tenant, &project, &principal).await?;
    Response::from_json(&settings)
}

async fn update_settings(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let body: UpdateSettingsRequest = req.json().await?;
    let database = db(&ctx.env)?;
    let principal = sty_protocol::TokenPrincipal { user: user.clone() };
    d1::ensure_project(&database, &tenant, &project, &principal).await?;
    let visibility = body.visibility.as_deref().unwrap_or("private");
    let default_workspace = body.default_workspace.as_deref().unwrap_or("main");
    let settings = d1::update_project_settings(&database, &tenant, &project, &principal, visibility, default_workspace, body.navbar_items, body.panels).await?;
    Response::from_json(&settings)
}

async fn star_project(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let (is_starred, starred_count) = d1::star_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&StarResponse { is_starred, starred_count })
}

async fn unstar_project(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let (is_starred, starred_count) = d1::unstar_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    Response::from_json(&StarResponse { is_starred, starred_count })
}

async fn missing(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let body: MissingRequest = req.json().await?;
    let store = bucket(&ctx.env)?;
    let mut missing = Vec::new();
    for id in body.ids {
        if d1::object_kind(&database, &tenant, &project, &id).await?.is_some() {
            continue;
        }
        let key = object_key(&tenant, &project, &id);
        if store.head(key).await?.is_none() {
            missing.push(id);
        }
    }
    Response::from_json(&MissingResponse { missing })
}

async fn upload(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let body: UploadRequest = req.json().await?;
    let store = bucket(&ctx.env)?;
    for object in body.objects {
        validate_object(&object)?;
        if d1::object_kind(&database, &tenant, &project, &object.id).await?.is_some() {
            continue;
        }
        let bytes = decode_base64(&object.bytes_base64)?;
        let size = bytes.len();
        put_bytes(&store, &object_key(&tenant, &project, &object.id), bytes).await?;
        d1::record_object(&database, &tenant, &project, &object.id, &object.kind, size).await?;
    }
    Response::from_json(&OkResponse { ok: true })
}

async fn upload_chunk(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let id = param(&ctx, "object")?;
    let chunk_index = param(&ctx, "chunk")?
        .parse::<usize>()
        .map_err(|_| Error::RustError("invalid chunk index".to_string()))?;
    let kind = required_header(&req, "x-pig-object-kind")?;
    let chunk_count = required_usize_header(&req, "x-pig-chunk-count")?;
    let total_size = required_usize_header(&req, "x-pig-total-size")?;
    validate_object_metadata(&id, &kind)?;
    if chunk_count == 0 || chunk_index >= chunk_count || total_size == 0 {
        return json_error(400, "invalid chunk metadata");
    }
    let store = bucket(&ctx.env)?;
    if d1::object_kind(&database, &tenant, &project, &id).await?.is_some() {
        return Response::from_json(&OkResponse { ok: true });
    }
    let bytes = req.bytes().await?;
    put_bytes(&store, &object_chunk_key(&tenant, &project, &id, chunk_index), bytes).await?;
    Response::from_json(&OkResponse { ok: true })
}

async fn complete_chunked_upload(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let id = param(&ctx, "object")?;
    let body: ChunkCompleteRequest = req.json().await?;
    validate_object_metadata(&id, &body.kind)?;
    if body.chunk_count == 0 {
        return json_error(400, "chunk_count must be greater than zero");
    }
    let store = bucket(&ctx.env)?;
    let key = object_key(&tenant, &project, &id);
    if d1::object_kind(&database, &tenant, &project, &id).await?.is_some() {
        return Response::from_json(&OkResponse { ok: true });
    }
    let mut bytes = Vec::with_capacity(body.total_size);
    for chunk_index in 0..body.chunk_count {
        let chunk_key = object_chunk_key(&tenant, &project, &id, chunk_index);
        let Some(object) = store.get(chunk_key).execute().await? else {
            return json_error(400, &format!("missing chunk {chunk_index} for object {id}"));
        };
        let Some(chunk_body) = object.body() else {
            return json_error(400, &format!("missing chunk body {chunk_index} for object {id}"));
        };
        bytes.extend(chunk_body.bytes().await?);
    }
    if bytes.len() != body.total_size {
        return json_error(400, "chunked object size does not match declared total size");
    }
    let digest = hex::encode(Sha256::digest(&bytes));
    if digest != id {
        return json_error(400, "object id does not match SHA-256 digest");
    }
    put_bytes(&store, &key, bytes).await?;
    d1::record_object(&database, &tenant, &project, &id, &body.kind, body.total_size).await?;
    for chunk_index in 0..body.chunk_count {
        store.delete(object_chunk_key(&tenant, &project, &id, chunk_index)).await?;
    }
    Response::from_json(&OkResponse { ok: true })
}

async fn download(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let body: DownloadRequest = req.json().await?;
    let store = bucket(&ctx.env)?;
    let mut objects = Vec::new();
    for id in body.ids {
        let key = object_key(&tenant, &project, &id);
        let Some(object) = store.get(key.clone()).execute().await? else {
            continue;
        };
        let Some(body) = object.body() else {
            continue;
        };
        let bytes = body.bytes().await?;
        let kind = match d1::object_kind(&database, &tenant, &project, &id).await? {
            Some(kind) => kind,
            None => {
                let Some(kind_object) = store.get(format!("{key}.kind")).execute().await? else {
                    continue;
                };
                let Some(kind_body) = kind_object.body() else {
                    continue;
                };
                let kind = kind_body.text().await?;
                d1::record_object(&database, &tenant, &project, &id, &kind, bytes.len()).await?;
                kind
            }
        };
        objects.push(RemoteObject {
            id,
            kind,
            bytes_base64: BASE64.encode(bytes),
        });
    }
    Response::from_json(&DownloadResponse { objects })
}

async fn get_object(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "object")?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
    let store = bucket(&ctx.env)?;
    let Some(object) = store.get(object_key(&tenant, &project, &id)).execute().await? else {
        return json_error(404, "object not found");
    };
    let Some(body) = object.body() else {
        return json_error(404, "object not found");
    };
    let bytes = body.bytes().await?;
    let kind = d1::object_kind(&database, &tenant, &project, &id)
        .await?
        .unwrap_or_else(|| "blob".to_string());
    Response::from_json(&RemoteObject {
        id,
        kind,
        bytes_base64: BASE64.encode(bytes),
    })
}

// ── Helpers ──────────────────────────────────────────────

pub(crate) async fn require_auth(req: &Request, env: &Env) -> Result<String> {
    let Some(value) = req.headers().get("authorization")? else {
        return Err(Error::RustError("missing bearer token".to_string()));
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Err(Error::RustError("missing bearer token".to_string()));
    };
    let database = db(env)?;
    match d1::principal_for_token(&database, token).await? {
        Some(principal) => Ok(principal.user),
        None => Err(Error::RustError("invalid bearer token".to_string())),
    }
}

pub(crate) async fn optional_auth(req: &Request, env: &Env) -> Result<Option<String>> {
    let Some(value) = req.headers().get("authorization")? else {
        return Ok(None);
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Ok(None);
    };
    let database = db(env)?;
    match d1::principal_for_token(&database, token).await? {
        Some(principal) => Ok(Some(principal.user)),
        None => Err(Error::RustError("invalid bearer token".to_string())),
    }
}

pub(crate) async fn check_project_access(
    env: &Env,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<()> {
    let database = db(env)?;
    if let Some(u) = user {
        d1::ensure_project(&database, tenant, project, &sty_protocol::TokenPrincipal { user: u.to_string() }).await?;
        Ok(())
    } else {
        match d1::project_visibility(&database, tenant, project).await? {
            Some(v) if v == "public" => Ok(()),
            _ => Err(Error::RustError("sign in required".to_string())),
        }
    }
}

async fn compare_relation(
    env: &Env,
    tenant: &str,
    project: &str,
    local_head: Option<&str>,
    remote_head: Option<&str>,
) -> Result<String> {
    let relation = match (local_head, remote_head) {
        (_, None) => "remote_missing",
        (Some(local), Some(remote)) if local == remote => "same",
        (None, Some(_)) => "remote_ahead",
        (Some(local), Some(remote)) if is_ancestor(env, tenant, project, remote, local).await? => "local_ahead",
        (Some(local), Some(remote)) if is_ancestor(env, tenant, project, local, remote).await? => "remote_ahead",
        _ => "diverged",
    };
    Ok(relation.to_string())
}

async fn is_ancestor(env: &Env, tenant: &str, project: &str, ancestor: &str, head: &str) -> Result<bool> {
    let mut seen = Vec::new();
    let mut stack = vec![head.to_string()];
    let store = bucket(env)?;
    while let Some(id) = stack.pop() {
        if id == ancestor {
            return Ok(true);
        }
        if seen.contains(&id) {
            continue;
        }
        seen.push(id.clone());
        let key = object_key(tenant, project, &id);
        let Ok(bytes) = r2_bytes(&store, &key).await else {
            continue;
        };
        let snapshot: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
        if let Some(parents) = snapshot["parents"].as_array() {
            for parent in parents {
                if let Some(pid) = parent.as_str() {
                    stack.push(pid.to_string());
                }
            }
        }
    }
    Ok(false)
}

async fn walk_tree(
    store: &Bucket,
    tenant: &str,
    project: &str,
    prefix: &str,
    root_tree: &str,
    output: &mut Vec<TreeEntryInfo>,
) -> Result<()> {
    let mut stack = vec![(prefix.to_string(), root_tree.to_string())];
    while let Some((prefix, tree_id)) = stack.pop() {
        let bytes = r2_bytes(store, &object_key(tenant, project, &tree_id)).await?;
        let tree: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let Some(entries) = tree["entries"].as_array() else {
            continue;
        };
        for entry in entries.iter().rev() {
            let name = entry["name"].as_str().unwrap_or_default().to_string();
            let id = entry["id"].as_str().unwrap_or_default().to_string();
            let entry_type = entry["entry_type"].as_str().unwrap_or_default().to_string();
            let path = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}/{name}")
            };
            output.push(TreeEntryInfo {
                path: path.clone(),
                name,
                id: id.clone(),
                entry_type: entry_type.clone(),
            });
            if entry_type == "tree" {
                stack.push((path, id));
            }
        }
    }
    output.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(())
}

async fn resolve_tree_path(
    store: &Bucket,
    tenant: &str,
    project: &str,
    root_tree: &str,
    path: &str,
) -> Result<Option<TreeEntryInfo>> {
    let parts = path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return Ok(None);
    }
    let mut tree_id = root_tree.to_string();
    let mut prefix = String::new();
    for (index, part) in parts.iter().enumerate() {
        let bytes = r2_bytes(store, &object_key(tenant, project, &tree_id)).await?;
        let tree: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| Error::RustError(e.to_string()))?;
        let Some(entries) = tree["entries"].as_array() else {
            return Ok(None);
        };
        let Some(entry) = entries.iter().find(|entry| entry["name"].as_str() == Some(*part)) else {
            return Ok(None);
        };
        let id = entry["id"].as_str().unwrap_or_default().to_string();
        let entry_type = entry["entry_type"].as_str().unwrap_or_default().to_string();
        let current_path = if prefix.is_empty() {
            (*part).to_string()
        } else {
            format!("{prefix}/{part}")
        };
        if index == parts.len() - 1 {
            return Ok(Some(TreeEntryInfo {
                path: current_path,
                name: (*part).to_string(),
                id,
                entry_type,
            }));
        }
        if entry_type != "tree" {
            return Ok(None);
        }
        prefix = current_path;
        tree_id = id;
    }
    Ok(None)
}
