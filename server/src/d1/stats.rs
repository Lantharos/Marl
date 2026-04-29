use super::*;

pub async fn project_stats(db: &D1Database, tenant: &str, project: &str) -> Result<ProjectStats> {
    let stats = select_project_stats(db, tenant, project).await?;
    if let Some(stats) = stats {
        return Ok(stats);
    }
    recompute_project_stats(db, tenant, project).await?;
    Ok(select_project_stats(db, tenant, project)
        .await?
        .unwrap_or_default())
}

pub async fn recompute_project_stats(db: &D1Database, tenant: &str, project: &str) -> Result<()> {
    let updated_at = now_rfc3339();
    db.prepare(
        "INSERT INTO project_stats (
            tenant, project, workspace_count, open_issue_count, ready_count,
            release_count, history_count, updated_at
         )
         VALUES (
            ?1,
            ?2,
            (SELECT COUNT(*) FROM workspace_states WHERE tenant = ?1 AND project = ?2 AND workspace != 'main'),
            (SELECT COUNT(*) FROM issues WHERE tenant = ?1 AND project = ?2 AND status = 'open'),
            (SELECT COUNT(*) FROM workspace_states WHERE tenant = ?1 AND project = ?2 AND workspace != 'main' AND is_ready = 1),
            (SELECT COUNT(*) FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = 'release'),
            (SELECT COUNT(*) FROM history WHERE tenant = ?1 AND project = ?2),
            ?3
         )
         ON CONFLICT(tenant, project) DO UPDATE SET
            workspace_count = excluded.workspace_count,
            open_issue_count = excluded.open_issue_count,
            ready_count = excluded.ready_count,
            release_count = excluded.release_count,
            history_count = excluded.history_count,
            updated_at = excluded.updated_at",
    )
    .bind(&[js_str(tenant), js_str(project), js_str(&updated_at)])?
    .run()
    .await?;
    Ok(())
}

async fn select_project_stats(
    db: &D1Database,
    tenant: &str,
    project: &str,
) -> Result<Option<ProjectStats>> {
    #[derive(Deserialize)]
    struct Row {
        workspace_count: f64,
        open_issue_count: f64,
        ready_count: f64,
        release_count: f64,
        history_count: f64,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT workspace_count, open_issue_count, ready_count, release_count, history_count
             FROM project_stats
             WHERE tenant = ?1 AND project = ?2",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.map(|row| ProjectStats {
        workspace_count: row.workspace_count as u64,
        open_issue_count: row.open_issue_count as u64,
        ready_count: row.ready_count as u64,
        release_count: row.release_count as u64,
        history_count: row.history_count as u64,
    }))
}
