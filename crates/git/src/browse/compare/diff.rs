use crate::process::Command;
use anyhow::Result;
use serde::Serialize;
use std::{collections::HashMap, path::Path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ComparedFile {
    pub(super) path: String,
    pub(super) old_path: Option<String>,
    pub(super) status: String,
    pub(super) additions: usize,
    pub(super) deletions: usize,
    pub(super) patch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) patch_omitted: Option<String>,
}

pub(super) async fn diff_files(repository: &Path, range: &str) -> Result<Vec<ComparedFile>> {
    let stats = diff_stats(repository, range).await?;
    let names = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["diff", "--name-status", "-z", "--find-renames", range])
        .output()
        .await?;
    if !names.status.success() {
        anyhow::bail!("git diff names failed")
    }
    let records = names
        .stdout
        .split(|byte| *byte == 0)
        .filter(|value| !value.is_empty())
        .map(|value| String::from_utf8_lossy(value).into_owned())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;
    while index < records.len() {
        let status_code = records[index].clone();
        index += 1;
        if index >= records.len() {
            break;
        }
        let first_path = records[index].clone();
        index += 1;
        let (old_path, path, status) = if status_code.starts_with('R') {
            if index >= records.len() {
                break;
            }
            let new_path = records[index].clone();
            index += 1;
            (Some(first_path), new_path, "renamed")
        } else {
            (
                None,
                first_path,
                match status_code.as_bytes().first() {
                    Some(b'A') => "added",
                    Some(b'D') => "deleted",
                    _ => "modified",
                },
            )
        };
        let (additions, deletions) = stats.get(&path).copied().unwrap_or_default();
        let patch_omitted = if status == "deleted" {
            Some("deleted".into())
        } else if additions + deletions >= 1_000 {
            Some("large".into())
        } else {
            Some("lazy".into())
        };
        files.push(ComparedFile {
            path,
            old_path,
            status: status.into(),
            additions,
            deletions,
            patch: String::new(),
            patch_omitted,
        });
    }
    Ok(files)
}

async fn diff_stats(repository: &Path, range: &str) -> Result<HashMap<String, (usize, usize)>> {
    let output = Command::new("git")
        .args(["-C"])
        .arg(repository)
        .args(["diff", "--numstat", "-z", "--find-renames", range])
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!("git diff stats failed")
    }
    let records = output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .collect::<Vec<_>>();
    let mut stats = HashMap::new();
    let mut index = 0;
    while index < records.len() {
        let record = String::from_utf8_lossy(records[index]);
        let mut fields = record.splitn(3, '\t');
        let additions = fields
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        let deletions = fields
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        let Some(path) = fields.next() else {
            index += 1;
            continue;
        };
        if path.is_empty() {
            if index + 2 >= records.len() {
                break;
            }
            stats.insert(
                String::from_utf8_lossy(records[index + 2]).into_owned(),
                (additions, deletions),
            );
            index += 3;
        } else {
            stats.insert(path.to_owned(), (additions, deletions));
            index += 1;
        }
    }
    Ok(stats)
}
