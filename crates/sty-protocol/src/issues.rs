use serde::{Deserialize, Serialize};

use crate::UserProfile;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Issue {
    pub id: String,
    pub number: u64,
    pub title: String,
    pub body: String,
    pub state: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state_reason: Option<String>,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_profile: Option<UserProfile>,
    pub assignees: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub labels: Vec<String>,
    pub milestone: Option<String>,
    pub workspace: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue_type: Option<String>,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub comment_count: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateIssueRequest {
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub assignee: Option<String>,
    #[serde(default)]
    pub assignees: Vec<String>,
    #[serde(default)]
    pub milestone: Option<String>,
    #[serde(default)]
    pub issue_type: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateIssueRequest {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub labels: Option<Vec<String>>,
    #[serde(default)]
    pub assignees: Option<Vec<String>>,
    #[serde(default)]
    pub milestone: Option<Option<String>>,
    #[serde(default)]
    pub issue_type: Option<Option<String>>,
    #[serde(default)]
    pub workspace: Option<Option<String>>,
    #[serde(default)]
    pub locked: Option<bool>,
    #[serde(default)]
    pub pinned: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Comment {
    pub id: String,
    pub issue_id: String,
    pub author: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author_profile: Option<UserProfile>,
    pub body: String,
    pub created_at: String,
    #[serde(default)]
    pub target_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateCommentRequest {
    pub body: String,
    #[serde(default)]
    pub target_type: Option<String>,
    #[serde(default)]
    pub target_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CommentsResponse {
    pub comments: Vec<Comment>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct IssuesResponse {
    pub issues: Vec<Issue>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProjectsResponse {
    pub projects: Vec<crate::ProjectSummary>,
}
