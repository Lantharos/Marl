use crate::{merge::MergeRequest, process::Command, state::git_output};
use anyhow::{Context, Result};
use std::path::Path;

pub(crate) async fn merge_tree(
    repository: &Path,
    left: &str,
    right: &str,
    merge_base: Option<&str>,
) -> Result<String> {
    let mut command = Command::new("git");
    command
        .args(["-C"])
        .arg(repository)
        .args(["merge-tree", "--write-tree"]);
    if let Some(base) = merge_base {
        command.arg(format!("--merge-base={base}"));
    }
    let output = command.args([left, right]).output().await?;
    if !output.status.success() {
        anyhow::bail!(
            "merge conflict: {}",
            String::from_utf8_lossy(&output.stdout)
        );
    }
    Ok(String::from_utf8(output.stdout)?
        .lines()
        .next()
        .context("merge-tree did not return a tree")?
        .trim()
        .to_owned())
}

pub(crate) async fn create_commit(
    repository: &Path,
    request: &MergeRequest,
    tree: &str,
    parents: &[&str],
    title: &str,
    author: Option<(&str, &str, &str)>,
    mark_operation: bool,
) -> Result<String> {
    let message = if mark_operation {
        format!("{title}\n\nMarl-Merge-Operation: {}", request.operation_id)
    } else {
        title.to_owned()
    };
    let mut command = Command::new("git");
    command
        .args(["-C"])
        .arg(repository)
        .args(["commit-tree", tree]);
    for parent in parents {
        command.args(["-p", parent]);
    }
    command.args(["-m", &message]);
    if let Some((name, email, date)) = author {
        command
            .env("GIT_AUTHOR_NAME", name)
            .env("GIT_AUTHOR_EMAIL", email)
            .env("GIT_AUTHOR_DATE", date);
    } else {
        command.env("GIT_AUTHOR_NAME", &request.author).env(
            "GIT_AUTHOR_EMAIL",
            format!("{}@users.marl.sh", request.author),
        );
    }
    let output = command
        .env("GIT_COMMITTER_NAME", &request.author)
        .env(
            "GIT_COMMITTER_EMAIL",
            format!("{}@users.marl.sh", request.author),
        )
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "commit-tree failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(String::from_utf8(output.stdout)?.trim().to_owned())
}

pub(crate) async fn rebase_commits(
    repository: &Path,
    request: &MergeRequest,
    target: &str,
    source: &str,
) -> Result<String> {
    let merge_base = git_output(repository, &["merge-base", target, source]).await?;
    let revision = format!("{}..{source}", merge_base.trim());
    let commits = git_output(
        repository,
        &[
            "rev-list",
            "--reverse",
            "--topo-order",
            "--no-merges",
            &revision,
        ],
    )
    .await?;
    let values = commits.lines().collect::<Vec<_>>();
    if values.is_empty() {
        return Ok(target.to_owned());
    }
    let mut current = target.to_owned();
    for (index, original) in values.iter().enumerate() {
        let parent = git_output(repository, &["rev-parse", &format!("{original}^")]).await?;
        let tree = merge_tree(repository, &current, original, Some(parent.trim())).await?;
        let metadata = git_output(
            repository,
            &["show", "-s", "--format=%an%x00%ae%x00%aI%x00%B", original],
        )
        .await?;
        let mut fields = metadata.splitn(4, '\0');
        let name = fields.next().context("commit author name missing")?;
        let email = fields.next().context("commit author email missing")?;
        let date = fields.next().context("commit author date missing")?;
        let title = fields.next().context("commit message missing")?.trim_end();
        let message = if index + 1 == values.len() {
            format!("{title}\n\nMarl-Rebased-From: {original}")
        } else {
            title.to_owned()
        };
        current = create_commit(
            repository,
            request,
            &tree,
            &[&current],
            &message,
            Some((name, email, date)),
            index + 1 == values.len(),
        )
        .await?;
    }
    Ok(current)
}
