use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::json;
use sha2::{Digest, Sha256};
use sty_protocol::{
    ChunkCompleteRequest, CommentsResponse, CompareRequest, CompareResponse, CreateCommentRequest,
    CreateIssueRequest, DownloadRequest, DownloadResponse, HeadResponse,
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

use auth::verify_ave_id_token;
use protocol::*;
use support::{
    apply_cors, bucket, db, decode_base64, json_error, object_chunk_key, object_key,
    param, preflight_response, project_params, put_bytes, required_header,
    required_usize_header, r2_bytes, validate_object, validate_object_metadata,
};

include!("code.rs");
include!("graph.rs");
include!("identity.rs");
include!("issues.rs");
include!("objects.rs");
include!("settings.rs");
include!("sync.rs");

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    if req.method() == Method::Options {
        return preflight_response(&req, &env);
    }
    let request = req.clone()?;
    let response = Router::new()
        .post_async("/v1/auth/check", auth_check)
        .get_async("/v1/capabilities", capabilities)
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
        .run(req, env.clone())
        .await;
    let mut response = match response {
        Ok(response) => response,
        Err(error) => Response::from_json(&json!({ "error": error.to_string() }))?.with_status(500),
    };
    apply_cors(&request, &env, &mut response)?;
    Ok(response)
}

