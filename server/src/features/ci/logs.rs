use super::super::super::*;
use super::super::{CiLogLine, CiRunner, ensure_ci_schema};
use serde::Deserialize;

#[derive(Deserialize)]
struct CiLogRow {
    seq: f64,
    stream: String,
    text: String,
    created_at: String,
}

pub struct CiLogInput<'a> {
    pub stream: &'a str,
    pub text: &'a str,
}

pub async fn append_ci_log(
    db: &Database,
    runner: &CiRunner,
    job_id: &str,
    stream: &str,
    text: &str,
) -> Result<bool> {
    append_ci_logs(db, runner, job_id, &[CiLogInput { stream, text }]).await
}

pub async fn append_ci_logs(
    db: &Database,
    runner: &CiRunner,
    job_id: &str,
    lines: &[CiLogInput<'_>],
) -> Result<bool> {
    ensure_ci_schema(db).await?;
    let lines = lines
        .iter()
        .filter_map(|line| {
            let text = line.text.chars().take(32_768).collect::<String>();
            (!text.is_empty()).then(|| {
                let stream = match line.stream {
                    "stdout" | "stderr" | "system" => line.stream,
                    _ => "system",
                };
                (stream.to_string(), text)
            })
        })
        .take(256)
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Ok(true);
    }
    if !super::ci_job_active_for_runner(db, runner, job_id).await? {
        return Ok(false);
    }
    let start_seq = next_ci_log_seq(db, job_id).await?;
    let now = now_rfc3339();
    let statements = lines
        .iter()
        .enumerate()
        .map(|(index, (stream, text))| {
            db.prepare(
                "INSERT INTO ci_job_logs (job_id, seq, stream, text, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(&[
                js_str(job_id),
                wasm_bindgen::JsValue::from_f64((start_seq + index as u64) as f64),
                js_str(stream),
                js_str(text),
                js_str(&now),
            ])
        })
        .collect::<Result<Vec<_>>>()?;
    db.batch(statements).await?;
    Ok(true)
}

pub async fn ci_job_logs(db: &Database, job_id: &str) -> Result<Vec<CiLogLine>> {
    ensure_ci_schema(db).await?;
    let result = db
        .prepare(
            "SELECT seq, stream, text, created_at
             FROM ci_job_logs
             WHERE job_id = ?1
             ORDER BY seq ASC",
        )
        .bind(&[js_str(job_id)])?
        .all()
        .await?;
    let rows: Vec<CiLogRow> = result.results()?;
    Ok(rows
        .into_iter()
        .map(|row| CiLogLine {
            seq: row.seq as u64,
            stream: row.stream,
            text: row.text,
            created_at: row.created_at,
        })
        .collect())
}

async fn next_ci_log_seq(db: &Database, job_id: &str) -> Result<u64> {
    #[derive(Deserialize)]
    struct Row {
        seq: f64,
    }
    let row: Option<Row> = db
        .prepare("SELECT COALESCE(MAX(seq) + 1, 1) AS seq FROM ci_job_logs WHERE job_id = ?1")
        .bind(&[js_str(job_id)])?
        .first(None)
        .await?;
    Ok(row.map(|row| row.seq as u64).unwrap_or(1))
}
