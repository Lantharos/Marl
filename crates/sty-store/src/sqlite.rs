use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Result, anyhow, bail};
use rusqlite::OptionalExtension;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use sty_protocol::{
    Comment, HistoryEntry, Issue, ProjectSettings, ProjectSummary, TenantSummary,
    TokenPrincipal, WorkspaceState, validate_segment,
};

use crate::Store;

pub struct SqliteStore {
    db_path: PathBuf,
    root: PathBuf,
    head_lock: Mutex<()>,
}

impl SqliteStore {
    pub fn new(root: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&root)?;
        let db_path = root.join("sty.db");
        let store = Self { db_path: db_path.clone(), root, head_lock: Mutex::new(()) };
        let conn = rusqlite::Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        store.init_schema(&conn)?;
        Ok(store)
    }

    fn conn(&self) -> Result<rusqlite::Connection> {
        let conn = rusqlite::Connection::open(&self.db_path)?;
        Ok(conn)
    }

    fn init_schema(&self, conn: &rusqlite::Connection) -> Result<()> {
        conn.execute_batch(
            "
            create table if not exists tokens (
                token_hash text primary key,
                user text not null
            );
            create table if not exists tenants (
                name text primary key,
                kind text not null,
                owner text not null,
                members_json text not null
            );
            create table if not exists projects (
                tenant text not null,
                project text not null,
                owner text not null,
                settings_json text not null default '{}',
                primary key (tenant, project)
            );
            create table if not exists workspace_heads (
                tenant text not null,
                project text not null,
                workspace text not null,
                head text,
                primary key (tenant, project, workspace)
            );
            create table if not exists workspace_states (
                tenant text not null,
                project text not null,
                workspace text not null,
                status text not null default 'active',
                is_ready integer not null default 0,
                parent_workspace text,
                mergeable integer not null default 0,
                primary key (tenant, project, workspace)
            );
            create table if not exists history (
                id text primary key,
                tenant text not null,
                project text not null,
                workspace text not null,
                kind text not null,
                message text not null,
                author text not null,
                timestamp text not null,
                snapshot_id text
            );
            create table if not exists issues (
                id text primary key,
                tenant text not null,
                project text not null,
                number integer not null,
                title text not null,
                body text not null,
                status text not null default 'open',
                author text not null,
                created_at text not null,
                labels_json text not null default '[]'
            );
            create table if not exists stars (
                tenant text not null,
                project text not null,
                user text not null,
                primary key (tenant, project, user)
            );
            create table if not exists comments (
                id text primary key,
                tenant text not null,
                project text not null,
                issue_id text not null,
                author text not null,
                body text not null,
                created_at text not null
            );
            create index if not exists idx_history_workspace on history(tenant, project, workspace);
            create index if not exists idx_issues_project on issues(tenant, project);
            create index if not exists idx_comments_issue on comments(tenant, project, issue_id);
            "
        )?;
        // Migration: add snapshot_id to existing history tables
        let has_snapshot_id: bool = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('history') WHERE name = 'snapshot_id'",
            [],
            |row| row.get(0),
        ).unwrap_or(0) > 0;
        if !has_snapshot_id {
            conn.execute("ALTER TABLE history ADD COLUMN snapshot_id text", [])?;
        }
        // Migration: add comments table
        let has_comments: bool = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'comments'",
            [],
            |row| row.get(0),
        ).unwrap_or(0) > 0;
        if !has_comments {
            conn.execute(
                "create table comments (
                    id text primary key,
                    tenant text not null,
                    project text not null,
                    issue_id text not null,
                    author text not null,
                    body text not null,
                    created_at text not null
                )",
                [],
            )?;
            conn.execute("create index idx_comments_issue on comments(tenant, project, issue_id)", [])?;
        }
        Ok(())
    }

    fn token_hash(&self, token: &str) -> String {
        hex::encode(Sha256::digest(token.as_bytes()))
    }

    fn ensure_user_tenant(&self, user: &str) -> Result<()> {
        let conn = self.conn()?;
        let members = serde_json::to_string(&vec![user.to_string()])?;
        conn.execute(
            "insert or ignore into tenants (name, kind, owner, members_json) values (?1, 'user', ?2, ?3)",
            rusqlite::params![user, user, members],
        )?;
        Ok(())
    }

    fn project_path(&self, tenant: &str, project: &str) -> Result<PathBuf> {
        validate_segment(tenant)?;
        validate_segment(project)?;
        let path = self.root.join("tenants").join(tenant).join("projects").join(project);
        std::fs::create_dir_all(&path)?;
        Ok(path)
    }

    fn object_path(&self, tenant: &str, project: &str, id: &str) -> Result<PathBuf> {
        Ok(self.project_path(tenant, project)?.join("objects").join(id))
    }

    fn object_exists(&self, tenant: &str, project: &str, id: &str) -> Result<bool> {
        let path = self.object_path(tenant, project, id)?;
        Ok(path.exists())
    }

    fn is_ancestor(&self, tenant: &str, project: &str, ancestor: &str, head: &str) -> Result<bool> {
        let mut seen = BTreeSet::new();
        let mut stack = vec![head.to_string()];
        while let Some(id) = stack.pop() {
            if id == ancestor {
                return Ok(true);
            }
            if !seen.insert(id.clone()) {
                continue;
            }
            let path = self.object_path(tenant, project, &id)?;
            if !path.exists() {
                continue;
            }
            let bytes = std::fs::read(&path)?;
            let snapshot: serde_json::Value = serde_json::from_slice(&bytes)?;
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

    fn star_count(&self, tenant: &str, project: &str) -> Result<u64> {
        let conn = self.conn()?;
        let count: i64 = conn.query_row(
            "select count(*) from stars where tenant = ?1 and project = ?2",
            rusqlite::params![tenant, project],
            |row| row.get(0),
        ).unwrap_or(0);
        Ok(count as u64)
    }
}

impl Store for SqliteStore {
    fn add_token(&self, user: &str) -> Result<String> {
        validate_segment(user)?;
        self.ensure_user_tenant(user)?;
        let token = format!("sty_dev_{}", Uuid::new_v4().simple());
        let hash = self.token_hash(&token);
        let conn = self.conn()?;
        conn.execute(
            "insert into tokens (token_hash, user) values (?1, ?2)",
            rusqlite::params![hash, user],
        )?;
        Ok(token)
    }

    fn principal_for_token(&self, token: &str) -> Result<Option<TokenPrincipal>> {
        let hash = self.token_hash(token);
        let conn = self.conn()?;
        let user: Option<String> = conn.query_row(
            "select user from tokens where token_hash = ?1",
            rusqlite::params![hash],
            |row| row.get(0),
        ).optional()?;
        Ok(user.map(|u| TokenPrincipal { user: u }))
    }

    fn ensure_project(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<()> {
        validate_segment(tenant)?;
        validate_segment(project)?;
        self.ensure_user_tenant(&principal.user)?;
        self.project_path(tenant, project)?;

        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;

        let members = serde_json::to_string(&vec![principal.user.clone()])?;
        tx.execute(
            "insert or ignore into tenants (name, kind, owner, members_json) values (?1, 'user', ?2, ?3)",
            rusqlite::params![tenant, principal.user, members],
        )?;

        let existing_owner: Option<String> = tx.query_row(
            "select owner from projects where tenant = ?1 and project = ?2",
            rusqlite::params![tenant, project],
            |row| row.get(0),
        ).optional()?;

        if existing_owner.is_none() {
            let settings = serde_json::to_string(&ProjectSettings {
                visibility: "private".to_string(),
                starred_count: 0,
                is_starred: false,
                default_workspace: "main".to_string(),
            })?;
            tx.execute(
                "insert into projects (tenant, project, owner, settings_json) values (?1, ?2, ?3, ?4)",
                rusqlite::params![tenant, project, principal.user, settings],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    fn projects(&self, _principal: &TokenPrincipal) -> Result<Vec<ProjectSummary>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "select tenant, project, owner from projects order by tenant, project"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ProjectSummary {
                tenant: row.get(0)?,
                project: row.get(1)?,
                owner: row.get(2)?,
            })
        })?;
        let mut projects = Vec::new();
        for row in rows {
            projects.push(row?);
        }
        Ok(projects)
    }

    fn tenants(&self, principal: &TokenPrincipal) -> Result<Vec<TenantSummary>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "select name, kind, owner from tenants where owner = ?1 or members_json like ?2 order by name"
        )?;
        let rows = stmt.query_map(
            rusqlite::params![principal.user, format!("%\"{}\"%", principal.user)],
            |row| {
                Ok(TenantSummary {
                    name: row.get(0)?,
                    kind: row.get(1)?,
                    owner: row.get(2)?,
                })
            }
        )?;
        let mut tenants = Vec::new();
        for row in rows {
            tenants.push(row?);
        }
        Ok(tenants)
    }

    fn create_org(&self, name: &str, principal: &TokenPrincipal) -> Result<TenantSummary> {
        validate_segment(name)?;
        let conn = self.conn()?;
        let members = serde_json::to_string(&vec![principal.user.clone()])?;
        conn.execute(
            "insert or ignore into tenants (name, kind, owner, members_json) values (?1, 'org', ?2, ?3)",
            rusqlite::params![name, principal.user, members],
        )?;
        Ok(TenantSummary {
            name: name.to_string(),
            kind: "org".to_string(),
            owner: principal.user.clone(),
        })
    }

    fn head(&self, tenant: &str, project: &str, workspace: &str) -> Result<Option<String>> {
        validate_segment(workspace)?;
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "select head from workspace_heads where tenant = ?1 and project = ?2 and workspace = ?3"
        )?;
        let head: Option<Option<String>> = stmt.query_row(
            rusqlite::params![tenant, project, workspace],
            |row| row.get(0),
        ).optional()?;
        Ok(head.flatten())
    }

    fn compare(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        local_head: Option<&str>,
    ) -> Result<(Option<String>, String)> {
        let remote_head = self.head(tenant, project, workspace)?;
        let relation = match (local_head, remote_head.as_deref()) {
            (_, None) => "remote_missing",
            (Some(local), Some(remote)) if local == remote => "same",
            (None, Some(_)) => "remote_ahead",
            (Some(local), Some(remote)) if self.is_ancestor(tenant, project, remote, local)? => "local_ahead",
            (Some(local), Some(remote)) if self.is_ancestor(tenant, project, local, remote)? => "remote_ahead",
            (Some(local), Some(_)) if !self.object_exists(tenant, project, local)? => "local_ahead",
            _ => "diverged",
        };
        Ok((remote_head, relation.to_string()))
    }

    fn update_head(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        expected_head: Option<&str>,
        new_head: &str,
    ) -> Result<bool> {
        let _guard = self.head_lock.lock().map_err(|_| anyhow!("head lock poisoned"))?;
        self.ensure_project(tenant, project, &TokenPrincipal { user: "system".to_string() })?;

        let path = self.project_path(tenant, project)?;
        let objects_dir = path.join("objects");
        std::fs::create_dir_all(&objects_dir)?;
        if !objects_dir.join(new_head).exists() {
            bail!("new head object is missing");
        }

        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        let current: Option<String> = tx.query_row(
            "select head from workspace_heads where tenant = ?1 and project = ?2 and workspace = ?3",
            rusqlite::params![tenant, project, workspace],
            |row| row.get(0),
        ).optional()?;

        if current.as_deref() != expected_head {
            tx.commit()?;
            return Ok(false);
        }

        tx.execute(
            "insert into workspace_heads (tenant, project, workspace, head) values (?1, ?2, ?3, ?4)
             on conflict(tenant, project, workspace) do update set head = excluded.head",
            rusqlite::params![tenant, project, workspace, new_head],
        )?;

        tx.execute(
            "insert into workspace_states (tenant, project, workspace, status, is_ready, parent_workspace, mergeable)
             values (?1, ?2, ?3, 'active', 0, null, 0)
             on conflict(tenant, project, workspace) do nothing",
            rusqlite::params![tenant, project, workspace],
        )?;

        tx.commit()?;
        Ok(true)
    }

    fn workspace_states(&self, tenant: &str, project: &str) -> Result<Vec<WorkspaceState>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "select ws.workspace, ws.status, wh.head, ws.parent_workspace, ws.is_ready, ws.mergeable
             from workspace_states ws
             left join workspace_heads wh on wh.tenant = ws.tenant and wh.project = ws.project and wh.workspace = ws.workspace
             where ws.tenant = ?1 and ws.project = ?2
             order by ws.workspace"
        )?;
        let mut states: Vec<WorkspaceState> = Vec::new();
        let rows = stmt.query_map(rusqlite::params![tenant, project], |row| {
            Ok(WorkspaceState {
                name: row.get(0)?,
                status: row.get(1)?,
                head: row.get(2)?,
                parent_workspace: row.get(3)?,
                child_workspaces: Vec::new(),
                is_ready: row.get::<_, i64>(4)? != 0,
                mergeable: row.get::<_, i64>(5)? != 0,
            })
        })?;
        for row in rows {
            states.push(row?);
        }
        // Compute child_workspaces
        let parents: std::collections::HashMap<String, Vec<String>> = states.iter().fold(
            std::collections::HashMap::new(),
            |mut map, ws| {
                if let Some(ref parent) = ws.parent_workspace {
                    map.entry(parent.clone()).or_default().push(ws.name.clone());
                }
                map
            }
        );
        for ws in &mut states {
            ws.child_workspaces = parents.get(&ws.name).cloned().unwrap_or_default();
        }
        Ok(states)
    }

    fn create_workspace(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        parent: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn()?;
        let parent_head: Option<String> = conn.query_row(
            "select head from workspace_heads where tenant = ?1 and project = ?2 and workspace = ?3",
            rusqlite::params![tenant, project, parent.unwrap_or("main")],
            |row| row.get(0),
        ).optional()?;
        conn.execute(
            "insert into workspace_heads (tenant, project, workspace, head) values (?1, ?2, ?3, ?4)",
            rusqlite::params![tenant, project, workspace, parent_head],
        )?;
        conn.execute(
            "insert into workspace_states (tenant, project, workspace, status, is_ready, parent_workspace, mergeable) values (?1, ?2, ?3, 'draft', 0, ?4, 0)",
            rusqlite::params![tenant, project, workspace, parent],
        )?;
        Ok(())
    }

    fn set_parent_workspace(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        parent: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "update workspace_states set parent_workspace = ?1
             where tenant = ?2 and project = ?3 and workspace = ?4",
            rusqlite::params![parent, tenant, project, workspace],
        )?;
        Ok(())
    }

    fn mark_workspace_ready(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        principal: &TokenPrincipal,
    ) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "update workspace_states set status = 'ready', is_ready = 1
             where tenant = ?1 and project = ?2 and workspace = ?3",
            rusqlite::params![tenant, project, workspace],
        )?;
        self.log_history(tenant, project, workspace, principal, "ready", &format!("{} marked workspace {} as ready", principal.user, workspace), None)?;
        Ok(())
    }

    fn merge_workspace(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        principal: &TokenPrincipal,
    ) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "update workspace_states set status = 'merged', is_ready = 0
             where tenant = ?1 and project = ?2 and workspace = ?3",
            rusqlite::params![tenant, project, workspace],
        )?;
        self.log_history(tenant, project, workspace, principal, "merge", &format!("{} merged workspace {}", principal.user, workspace), None)?;
        Ok(())
    }

    fn workspace_history(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
    ) -> Result<Vec<HistoryEntry>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "select id, kind, message, author, timestamp, workspace, snapshot_id from history
             where tenant = ?1 and project = ?2 and workspace = ?3
             order by timestamp desc"
        )?;
        let rows = stmt.query_map(rusqlite::params![tenant, project, workspace], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                kind: row.get(1)?,
                message: row.get(2)?,
                author: row.get(3)?,
                timestamp: row.get(4)?,
                workspace: row.get(5)?,
                snapshot_id: row.get(6)?,
            })
        })?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    fn log_history(
        &self,
        tenant: &str,
        project: &str,
        workspace: &str,
        principal: &TokenPrincipal,
        kind: &str,
        message: &str,
        snapshot_id: Option<&str>,
    ) -> Result<()> {
        let id = format!("{}-{}", kind, Uuid::new_v4().simple());
        let timestamp = chrono::Utc::now().to_rfc3339();
        let conn = self.conn()?;
        conn.execute(
            "insert into history (id, tenant, project, workspace, kind, message, author, timestamp, snapshot_id)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![id, tenant, project, workspace, kind, message, principal.user, timestamp, snapshot_id],
        )?;
        Ok(())
    }

    fn get_history_entry(
        &self,
        tenant: &str,
        project: &str,
        entry_id: &str,
    ) -> Result<Option<HistoryEntry>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "select id, kind, message, author, timestamp, workspace, snapshot_id from history
             where tenant = ?1 and project = ?2 and id = ?3"
        )?;
        let row = stmt.query_row(rusqlite::params![tenant, project, entry_id], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                kind: row.get(1)?,
                message: row.get(2)?,
                author: row.get(3)?,
                timestamp: row.get(4)?,
                workspace: row.get(5)?,
                snapshot_id: row.get(6)?,
            })
        }).optional()?;
        Ok(row)
    }

    fn list_issues(&self, tenant: &str, project: &str) -> Result<Vec<Issue>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "select id, number, title, body, status, author, created_at, labels_json from issues
             where tenant = ?1 and project = ?2 order by number desc"
        )?;
        let rows = stmt.query_map(rusqlite::params![tenant, project], |row| {
            let labels_json: String = row.get(7)?;
            let labels: Vec<String> = serde_json::from_str(&labels_json).unwrap_or_default();
            Ok(Issue {
                id: row.get(0)?,
                number: row.get(1)?,
                title: row.get(2)?,
                body: row.get(3)?,
                status: row.get(4)?,
                author: row.get(5)?,
                created_at: row.get(6)?,
                labels,
            })
        })?;
        let mut issues = Vec::new();
        for row in rows {
            issues.push(row?);
        }
        Ok(issues)
    }

    fn create_issue(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
        title: &str,
        body: &str,
    ) -> Result<Issue> {
        let conn = self.conn()?;
        let next_number: u64 = conn.query_row(
            "select coalesce(max(number), 0) + 1 from issues where tenant = ?1 and project = ?2",
            rusqlite::params![tenant, project],
            |row| row.get(0),
        ).unwrap_or(1);
        let id = format!("issue-{}", next_number);
        let created_at = chrono::Utc::now().to_rfc3339();
        let labels = serde_json::to_string(&Vec::<String>::new())?;
        conn.execute(
            "insert into issues (id, tenant, project, number, title, body, status, author, created_at, labels_json)
             values (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?8, ?9)",
            rusqlite::params![id, tenant, project, next_number, title, body, principal.user, created_at, labels],
        )?;
        Ok(Issue {
            id,
            number: next_number,
            title: title.to_string(),
            body: body.to_string(),
            status: "open".to_string(),
            author: principal.user.clone(),
            created_at,
            labels: Vec::new(),
        })
    }

    fn update_issue_status(
        &self,
        tenant: &str,
        project: &str,
        issue_id: &str,
        status: &str,
    ) -> Result<Issue> {
        let conn = self.conn()?;
        conn.execute(
            "update issues set status = ?1 where tenant = ?2 and project = ?3 and id = ?4",
            rusqlite::params![status, tenant, project, issue_id],
        )?;
        let mut stmt = conn.prepare(
            "select id, number, title, body, status, author, created_at, labels_json from issues
             where tenant = ?1 and project = ?2 and id = ?3"
        )?;
        let issue = stmt.query_row(rusqlite::params![tenant, project, issue_id], |row| {
            let labels_json: String = row.get(7)?;
            let labels = serde_json::from_str(&labels_json).unwrap_or_default();
            Ok(Issue {
                id: row.get(0)?,
                number: row.get(1)?,
                title: row.get(2)?,
                body: row.get(3)?,
                status: row.get(4)?,
                author: row.get(5)?,
                created_at: row.get(6)?,
                labels,
            })
        })?;
        Ok(issue)
    }

    fn list_comments(&self, tenant: &str, project: &str, issue_id: &str) -> Result<Vec<Comment>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "select id, issue_id, author, body, created_at from comments
             where tenant = ?1 and project = ?2 and issue_id = ?3
             order by created_at"
        )?;
        let rows = stmt.query_map(rusqlite::params![tenant, project, issue_id], |row| {
            Ok(Comment {
                id: row.get(0)?,
                issue_id: row.get(1)?,
                author: row.get(2)?,
                body: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        let mut comments = Vec::new();
        for row in rows {
            comments.push(row?);
        }
        Ok(comments)
    }

    fn create_comment(
        &self,
        tenant: &str,
        project: &str,
        issue_id: &str,
        principal: &TokenPrincipal,
        body: &str,
    ) -> Result<Comment> {
        let conn = self.conn()?;
        let id = format!("comment-{}", Uuid::new_v4().simple());
        let created_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "insert into comments (id, tenant, project, issue_id, author, body, created_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![id, tenant, project, issue_id, principal.user, body, created_at],
        )?;
        Ok(Comment {
            id,
            issue_id: issue_id.to_string(),
            author: principal.user.clone(),
            body: body.to_string(),
            created_at,
        })
    }

    fn project_settings(&self, tenant: &str, project: &str, principal: &TokenPrincipal) -> Result<ProjectSettings> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "select settings_json from projects where tenant = ?1 and project = ?2"
        )?;
        let settings_json: String = stmt.query_row(
            rusqlite::params![tenant, project],
            |row| row.get(0),
        )?;
        let mut settings: ProjectSettings = serde_json::from_str(&settings_json)?;
        settings.starred_count = self.star_count(tenant, project)?;
        settings.is_starred = self.is_starred(tenant, project, principal)?;
        Ok(settings)
    }

    fn update_project_settings(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
        visibility: &str,
        default_workspace: &str,
    ) -> Result<ProjectSettings> {
        let mut settings = self.project_settings(tenant, project, principal)?;
        settings.visibility = visibility.to_string();
        settings.default_workspace = default_workspace.to_string();
        let json = serde_json::to_string(&settings)?;
        let conn = self.conn()?;
        conn.execute(
            "update projects set settings_json = ?1 where tenant = ?2 and project = ?3",
            rusqlite::params![json, tenant, project],
        )?;
        Ok(settings)
    }

    fn star_project(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<(bool, u64)> {
        let conn = self.conn()?;
        conn.execute(
            "insert or ignore into stars (tenant, project, user) values (?1, ?2, ?3)",
            rusqlite::params![tenant, project, principal.user],
        )?;
        Ok((true, self.star_count(tenant, project)?))
    }

    fn unstar_project(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<(bool, u64)> {
        let conn = self.conn()?;
        conn.execute(
            "delete from stars where tenant = ?1 and project = ?2 and user = ?3",
            rusqlite::params![tenant, project, principal.user],
        )?;
        Ok((false, self.star_count(tenant, project)?))
    }

    fn is_starred(
        &self,
        tenant: &str,
        project: &str,
        principal: &TokenPrincipal,
    ) -> Result<bool> {
        let conn = self.conn()?;
        let count: i64 = conn.query_row(
            "select count(*) from stars where tenant = ?1 and project = ?2 and user = ?3",
            rusqlite::params![tenant, project, principal.user],
            |row| row.get(0),
        ).unwrap_or(0);
        Ok(count > 0)
    }

    fn root(&self) -> &Path {
        &self.root
    }
}
