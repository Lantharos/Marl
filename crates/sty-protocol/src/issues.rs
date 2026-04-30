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
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateIssueRequest {
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub assignee: Option<String>,
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
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateCommentRequest {
    pub body: String,
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
