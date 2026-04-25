use std::path::Path;

use anyhow::Result;
use sty_protocol::{
    HistoryEntry, Issue, ProjectSettings, ProjectSummary, TenantSummary,
    TokenPrincipal, WorkspaceState,
};

/// Shared store interface for both local (SQLite) and worker (D1) backends.
pub trait Store {
    // ── Auth ───────────────────────────────────────────────
    fn add_token(&self, user: &str) -> Result<String>;
    fn principal_for_token(&self, token: &str) -> Result<Option<TokenPrincipal>>;

    // ── Tenants / Projects ─────────────────────────────────
    fn ensure_project(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<()>;
    fn projects(&self, principal: &TokenPrincipal) -> Result<Vec<ProjectSummary>>;
    fn tenants(&self, principal: &TokenPrincipal) -> Result<Vec<TenantSummary>>;
    fn create_org(&self, name: &str, principal: &TokenPrincipal) -> Result<TenantSummary>;

    // ── Workspace heads ────────────────────────────────────
    fn head(&self, tenant: &str, project: &str, workspace: &str) -> Result<Option<String>>;
    fn compare(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        local_head: Option<&str>,
    ) -> Result<(Option<String>, String)>;
    fn update_head(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        expected_head: Option<&str>,
        new_head: &str,
    ) -> Result<bool>;

    // ── Workspace state ────────────────────────────────────
    fn workspace_states(&self, tenant: &str, project: &str) -> Result<Vec<WorkspaceState>>;
    fn mark_workspace_ready(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        principal: &TokenPrincipal,
    ) -> Result<()>;
    fn merge_workspace(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        principal: &TokenPrincipal,
    ) -> Result<()>;

    // ── History ────────────────────────────────────────────
    fn workspace_history(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
    ) -> Result<Vec<HistoryEntry>>;
    fn log_history(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        principal: &TokenPrincipal,
        kind: &str,
        message: &str,
    ) -> Result<()>;

    // ── Issues ─────────────────────────────────────────────
    fn list_issues(&self, tenant: &str, project: &str) -> Result<Vec<Issue>>;
    fn create_issue(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
        title: &str,
        body: &str,
    ) -> Result<Issue>;

    // ── Settings / Stars ───────────────────────────────────
    fn project_settings(&self, tenant: &str, project: &str) -> Result<ProjectSettings>;
    fn update_project_settings(
        &self,
        tenant: &str,
        project: &str,
        visibility: &str,
        default_workspace: &str,
    ) -> Result<ProjectSettings>;
    fn star_project(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<(bool, u64)>;
    fn unstar_project(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<(bool, u64)>;
    fn is_starred(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<bool>;

    // ── Paths ──────────────────────────────────────────────
    fn root(&self) -> &Path;
}

#[cfg(feature = "sqlite")]
pub mod sqlite;
