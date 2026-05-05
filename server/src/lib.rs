use serde_json::json;
use sha2::{Digest, Sha256};
use sty_protocol::{
    AuthCheckResponse, CommentsResponse, CompareRequest, CompareResponse, CreateCommentRequest,
    CreateIssueRequest, HeadResponse, HeadUpdateRequest, HistoryEntry, HistoryResponse,
    HistorySignature, LogHistoryRequest, MeResponse, MissingRequest, MissingResponse,
    CreateProjectRequest, ObjectFileResponse, OkResponse, ProjectDetailResponse, ProjectSummary,
    ProjectTreeResponse, SessionExchangeRequest, TokenResponse, TreeEntryInfo, UpdateIssueRequest,
    UpdateSettingsRequest, WorkspaceStateResponse, WorkspaceSummary, validate_segment,
};
use worker::*;

mod account_keys;
mod auth;
mod collaborators;
pub(crate) mod d1;
mod developer;
mod forks;
mod protocol;
mod protocol_profiles;
mod protocol_ready;
mod release_support;
mod releases;
mod request_context;
mod support;

use account_keys::*;
use auth::verify_ave_id_token;
use collaborators::*;
use developer::*;
use forks::*;
use protocol::*;
use protocol_ready::*;
use releases::*;
use request_context::AppContext;
use support::{
    MAX_TREE_DEPTH, MAX_TREE_ENTRIES, apply_cache_headers, apply_cors, bearer_token, bucket, db,
    delete_prefix, frontend_origin, json_error, not_modified_response, object_key,
    object_size_limit, paginate_vec, param, preflight_response, project_params, put_bytes,
    query_limit, r2_bytes, required_header, required_usize_header, response_for_error,
    validate_object_id, validate_object_metadata, validate_object_payload,
    validate_tree_entry_name,
};

include!("code.rs");
include!("graph.rs");
include!("home.rs");
include!("identity.rs");
include!("issues.rs");
include!("objects.rs");
include!("overview.rs");
include!("settings.rs");
include!("sync.rs");

#[event(fetch)]
pub async fn main(req: Request, env: Env, ctx: Context) -> Result<Response> {
    if req.method() == Method::Options {
        return preflight_response(&req, &env);
    }
    let request = req.clone()?;
    let app_context = AppContext::new(&request, &env, ctx)?;
    let response = Router::with_data(app_context.clone())
        .post_async("/v1/auth/check", auth_check)
        .get_async("/v1/capabilities", capabilities)
        .post_async("/v1/session/exchange", exchange_session)
        .delete_async("/v1/session", revoke_session)
        .get_async("/v1/me", me)
        .get_async("/v1/users/search", search_users)
        .post_async("/v1/remote-approvals", create_remote_approval)
        .get_async("/v1/remote-approvals/:approval_id", get_remote_approval)
        .post_async(
            "/v1/remote-approvals/:approval_id/approve",
            approve_remote_approval,
        )
        .get_async("/v1/account/keys", list_account_keys)
        .post_async("/v1/account/keys", create_account_key)
        .delete_async("/v1/account/keys/:key_id", delete_account_key)
        .get_async("/v1/account/ssh-keys", list_account_ssh_keys)
        .post_async("/v1/account/ssh-keys", create_account_ssh_key)
        .delete_async("/v1/account/ssh-keys/:key_id", delete_account_ssh_key)
        .get_async("/v1/developer/apps", list_developer_apps)
        .post_async("/v1/developer/apps", create_developer_app)
        .delete_async("/v1/developer/apps/:app_id", delete_developer_app)
        .get_async("/v1/oauth/apps/:client_id", oauth_app)
        .post_async("/v1/oauth/authorize", oauth_authorize)
        .post_async("/v1/oauth/token", oauth_token)
        .post_async("/v1/orgs", create_org)
        .get_async("/v1/tenants/:tenant/collaborators", list_tenant_collaborators)
        .post_async("/v1/tenants/:tenant/collaborators", add_tenant_collaborator)
        .patch_async(
            "/v1/tenants/:tenant/collaborators/:user",
            update_tenant_collaborator,
        )
        .delete_async(
            "/v1/tenants/:tenant/collaborators/:user",
            delete_tenant_collaborator,
        )
        .get_async("/v1/home", home)
        .get_async("/v1/follows", follows)
        .get_async("/v1/discover/projects", discover_projects)
        .post_async("/v1/forks", fork_project)
        .get_async("/v1/projects", list_projects)
        .get_async("/v1/tenants/:tenant/folders", list_tenant_folders)
        .post_async("/v1/tenants/:tenant/folders", create_tenant_folder)
        .get_async("/v1/tenants/:tenant/projects", tenant_projects)
        .post_async("/v1/tenants/:tenant/projects/:project", create_project)
        .get_async("/v1/tenants/:tenant/projects/:project", project_detail)
        .delete_async("/v1/tenants/:tenant/projects/:project", delete_project)
        .patch_async(
            "/v1/tenants/:tenant/projects/:project/folder",
            move_project_folder,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/access",
            project_access,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/collaborators",
            list_project_collaborators,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/collaborators",
            add_project_collaborator,
        )
        .patch_async(
            "/v1/tenants/:tenant/projects/:project/collaborators/:user",
            update_project_collaborator,
        )
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/collaborators/:user",
            delete_project_collaborator,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/overview",
            project_overview,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/stats",
            project_stats,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/workspaces",
            list_workspaces,
        )
        .get_async("/v1/tenants/:tenant/projects/:project/tree", project_tree)
        .get_async(
            "/v1/tenants/:tenant/projects/:project/files/:path",
            project_file,
        )
        .get_async("/v1/tenants/:tenant/projects/:project/files", project_file)
        .get_async(
            "/v1/tenants/:tenant/projects/:project/issues",
            project_issues,
        )
        .post_async("/v1/tenants/:tenant/projects/:project/issues", create_issue)
        .get_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id",
            get_issue,
        )
        .patch_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id",
            update_issue,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id/close",
            close_issue,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id/reopen",
            reopen_issue,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id/assignees",
            assign_issue,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id/labels",
            label_issue,
        )
        .get_async("/v1/tenants/:tenant/projects/:project/labels", list_labels)
        .post_async("/v1/tenants/:tenant/projects/:project/labels", create_label)
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/labels/:item_id",
            delete_protocol_item,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/milestones",
            list_milestones,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/milestones",
            create_milestone,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/milestones/:item_id",
            get_protocol_item,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/milestones/:item_id/close",
            close_protocol_item,
        )
        .get_async("/v1/tenants/:tenant/projects/:project/ready", list_ready)
        .get_async(
            "/v1/tenants/:tenant/projects/:project/ready/:workspace",
            get_ready,
        )
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/ready",
            unmark_ready,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/reject",
            reject_ready,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/comments",
            list_protocol_comments,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/comments",
            create_protocol_comment,
        )
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/comments/:item_id",
            delete_protocol_item,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/comments/:item_id/reactions",
            list_reactions,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/comments/:item_id/reactions",
            add_reaction,
        )
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/comments/:item_id/reactions/:reaction",
            delete_reaction,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id/reactions",
            list_reactions,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id/reactions",
            add_reaction,
        )
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id/reactions/:reaction",
            delete_reaction,
        )
        .get_async("/v1/tenants/:tenant/projects/:project/hooks", list_hooks)
        .post_async("/v1/tenants/:tenant/projects/:project/hooks", create_hook)
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/hooks/:item_id",
            delete_protocol_item,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/hooks/:item_id/test",
            test_protocol_item,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/api-keys",
            list_project_api_keys,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/api-keys",
            create_project_api_key,
        )
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/api-keys/:item_id",
            delete_project_api_key,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/webhooks",
            list_project_webhooks,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/webhooks",
            create_project_webhook,
        )
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/webhooks/:item_id",
            delete_project_webhook,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/webhooks/:item_id/test",
            test_project_webhook,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/integrations",
            list_project_integrations,
        )
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/integrations/:item_id",
            delete_project_integration,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/search",
            search_project,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/releases",
            list_releases,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/releases",
            create_release,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/releases/:item_id/artifacts",
            upload_release_artifact,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/releases/:item_id/artifacts/:artifact_id/download",
            download_release_artifact,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/releases/:item_id",
            get_release,
        )
        .get_async("/v1/tenants/:tenant/projects/:project/keys", list_keys)
        .post_async("/v1/tenants/:tenant/projects/:project/keys", create_key)
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/keys/:item_id",
            delete_protocol_item,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/snapshots/verify",
            verify_all_snapshots,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/snapshots/:item_id/verify",
            verify_snapshot,
        )
        .get_async("/v1/tenants/:tenant/projects/:project/users/me", profile_me)
        .get_async(
            "/v1/tenants/:tenant/projects/:project/users/:item_id",
            profile_user,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/ssh-keys",
            list_ssh_keys,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/ssh-keys",
            create_ssh_key,
        )
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/ssh-keys/:item_id",
            delete_protocol_item,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id/comments",
            issue_comments,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/issues/:issue_id/comments",
            create_comment,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/head",
            get_head,
        )
        .put_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/head",
            update_head,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/history",
            project_history,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/history",
            workspace_history,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/history",
            log_history,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/merge-preview",
            merge_preview,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/history/:entry_id",
            history_entry,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/ready",
            mark_ready,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/merge",
            merge_workspace,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/parent",
            set_parent,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/workspaces/:workspace/compare",
            compare,
        )
        .post_async("/v1/tenants/:tenant/projects/:project/sendwork", send_work)
        .get_async(
            "/v1/tenants/:tenant/projects/:project/settings",
            get_settings,
        )
        .patch_async(
            "/v1/tenants/:tenant/projects/:project/settings",
            update_settings,
        )
        .get_async("/v1/tenants/:tenant/projects/:project/follow", project_follow)
        .post_async("/v1/tenants/:tenant/projects/:project/follow", follow_project)
        .delete_async(
            "/v1/tenants/:tenant/projects/:project/follow",
            unfollow_project,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/objects/missing",
            missing,
        )
        .post_async(
            "/v1/tenants/:tenant/projects/:project/objects/check",
            missing,
        )
        .put_async(
            "/v1/tenants/:tenant/projects/:project/objects/:object",
            put_object,
        )
        .get_async(
            "/v1/tenants/:tenant/projects/:project/objects/:object",
            get_object,
        )
        .get_async("/v1/tenants/:tenant/projects/:project/tags", list_tags)
        .post_async("/v1/tenants/:tenant/projects/:project/tags", create_tag)
        .get_async(
            "/v1/tenants/:tenant/projects/:project/tags/:item_id",
            get_protocol_item,
        )
        .run(req, env.clone())
        .await;
    let mut response = match response {
        Ok(response) => response,
        Err(error) => response_for_error(error)?,
    };
    app_context.apply_bookmark(&mut response)?;
    apply_cors(&request, &env, &mut response)?;
    Ok(response)
}
