use crate::{
    Blob, BranchInfo, Change, ChangeKind, Commit, Diff, RepositoryInfo, Status, TreeEntry,
    TreeEntryKind,
};
use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Output};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, RepoError>;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error("Git is not installed or could not be started: {0}")]
    GitUnavailable(#[source] std::io::Error),
    #[error("{operation} failed: {message}")]
    Git { operation: String, message: String },
    #[error("Git returned invalid UTF-8 while {0}")]
    InvalidUtf8(String),
    #[error("Git returned malformed data while {0}: {1}")]
    Malformed(String, String),
    #[error("repository path must be relative and cannot escape the repository: {0}")]
    UnsafePath(String),
}

#[derive(Debug, Clone)]
pub struct Repository {
    root: PathBuf,
    git_dir: PathBuf,
}

impl Repository {
    pub fn discover(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let root = run_at(
            path,
            "discover repository",
            ["rev-parse", "--show-toplevel"],
        )?;
        let root = PathBuf::from(trim_output(&root, "discover repository")?);
        let git_dir = run_at(
            &root,
            "locate Git directory",
            ["rev-parse", "--absolute-git-dir"],
        )?;
        let git_dir = PathBuf::from(trim_output(&git_dir, "locate Git directory")?);
        Ok(Self { root, git_dir })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn git_dir(&self) -> &Path {
        &self.git_dir
    }

    pub fn info(&self) -> Result<RepositoryInfo> {
        Ok(RepositoryInfo {
            root: self.root.clone(),
            git_dir: self.git_dir.clone(),
            branch: self.status()?.branch,
        })
    }

    pub fn status(&self) -> Result<Status> {
        let output = self.git(
            "read repository status",
            [
                "status",
                "--porcelain=v2",
                "--branch",
                "-z",
                "--untracked-files=all",
            ],
        )?;
        parse_status(&output.stdout)
    }

    pub fn commits(&self, revision: Option<&str>, limit: usize) -> Result<Vec<Commit>> {
        let limit = limit.clamp(1, 500).to_string();
        let mut args = vec![
            OsString::from("log"),
            OsString::from("--no-decorate"),
            OsString::from("--date=iso-strict"),
            OsString::from("--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e"),
            OsString::from("-n"),
            OsString::from(limit),
        ];
        if let Some(revision) = revision {
            args.push(OsString::from(revision));
        }
        let output = self.git_os("read commit history", args)?;
        let text = utf8(&output.stdout, "read commit history")?;
        text.split('\x1e')
            .filter(|record| !record.trim().is_empty())
            .map(|record| {
                let fields: Vec<_> = record
                    .trim_start_matches(['\r', '\n'])
                    .split('\x1f')
                    .collect();
                if fields.len() != 5 {
                    return Err(RepoError::Malformed(
                        "read commit history".into(),
                        record.into(),
                    ));
                }
                Ok(Commit {
                    id: fields[0].into(),
                    short_id: fields[1].into(),
                    author: fields[2].into(),
                    authored_at: fields[3].into(),
                    title: fields[4].trim_end_matches(['\r', '\n']).into(),
                })
            })
            .collect()
    }

    pub fn tree(&self, revision: &str, path: Option<&str>) -> Result<Vec<TreeEntry>> {
        let clean_path = path.map(validate_repo_path).transpose()?;
        let treeish = clean_path
            .as_deref()
            .map_or_else(|| revision.to_owned(), |path| format!("{revision}:{path}"));
        let args = vec![
            OsString::from("ls-tree"),
            OsString::from("-z"),
            OsString::from("--long"),
            OsString::from(treeish),
        ];
        let output = self.git_os("read repository tree", args)?;
        let mut entries = Vec::new();
        for record in output
            .stdout
            .split(|byte| *byte == 0)
            .filter(|record| !record.is_empty())
        {
            let tab = record
                .iter()
                .position(|byte| *byte == b'\t')
                .ok_or_else(|| {
                    RepoError::Malformed(
                        "read repository tree".into(),
                        String::from_utf8_lossy(record).into(),
                    )
                })?;
            let metadata = utf8(&record[..tab], "read repository tree")?;
            let child_path = utf8(&record[tab + 1..], "read repository tree")?;
            let file_path = clean_path.as_deref().map_or_else(
                || child_path.to_owned(),
                |path| format!("{path}/{child_path}"),
            );
            let parts: Vec<_> = metadata.split_whitespace().collect();
            if parts.len() != 4 {
                return Err(RepoError::Malformed(
                    "read repository tree".into(),
                    metadata.into(),
                ));
            }
            let kind = match parts[1] {
                "blob" => TreeEntryKind::Blob,
                "tree" => TreeEntryKind::Tree,
                "commit" => TreeEntryKind::Commit,
                other => {
                    return Err(RepoError::Malformed(
                        "read repository tree".into(),
                        other.into(),
                    ));
                }
            };
            entries.push(TreeEntry {
                name: Path::new(&file_path)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                path: file_path,
                kind,
                object_id: parts[2].into(),
                size: parts[3].parse().ok(),
            });
        }
        Ok(entries)
    }

    pub fn read_blob(&self, revision: &str, path: &str) -> Result<Blob> {
        let path = validate_repo_path(path)?;
        let spec = format!("{revision}:{path}");
        let output = self.git_os(
            "read file",
            [
                OsString::from("show"),
                OsString::from("--no-textconv"),
                OsString::from(spec),
            ],
        )?;
        Ok(Blob {
            revision: revision.into(),
            path,
            bytes: output.stdout,
        })
    }

    pub fn diff(
        &self,
        base: Option<&str>,
        head: Option<&str>,
        paths: &[String],
        context: usize,
    ) -> Result<Diff> {
        let paths = paths
            .iter()
            .map(|path| validate_repo_path(path))
            .collect::<Result<Vec<_>>>()?;
        let mut args = vec![
            OsString::from("diff"),
            OsString::from("--no-ext-diff"),
            OsString::from("--no-color"),
            OsString::from(format!("--unified={}", context.min(100))),
        ];
        if let Some(base) = base {
            args.push(base.into());
        }
        if let Some(head) = head {
            args.push(head.into());
        }
        if !paths.is_empty() {
            args.push("--".into());
            args.extend(paths.iter().map(OsString::from));
        }
        let output = self.git_os("build diff", args)?;
        Ok(Diff {
            base: base.map(str::to_owned),
            head: head.map(str::to_owned),
            patch: utf8(&output.stdout, "build diff")?.into(),
        })
    }

    fn git<const N: usize>(&self, operation: &str, args: [&str; N]) -> Result<Output> {
        run_at(&self.root, operation, args)
    }
    fn git_os(&self, operation: &str, args: impl IntoIterator<Item = OsString>) -> Result<Output> {
        run_at_os(&self.root, operation, args)
    }
}

fn run_at<const N: usize>(path: &Path, operation: &str, args: [&str; N]) -> Result<Output> {
    run_at_os(path, operation, args.into_iter().map(OsString::from))
}

fn run_at_os(
    path: &Path,
    operation: &str,
    args: impl IntoIterator<Item = OsString>,
) -> Result<Output> {
    let output = Command::new("git")
        .current_dir(path)
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .map_err(RepoError::GitUnavailable)?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(RepoError::Git {
            operation: operation.into(),
            message: String::from_utf8_lossy(&output.stderr).trim().into(),
        })
    }
}

fn trim_output<'a>(output: &'a Output, operation: &str) -> Result<&'a str> {
    Ok(utf8(&output.stdout, operation)?.trim())
}
fn utf8<'a>(bytes: &'a [u8], operation: &str) -> Result<&'a str> {
    std::str::from_utf8(bytes).map_err(|_| RepoError::InvalidUtf8(operation.into()))
}

fn validate_repo_path(path: &str) -> Result<String> {
    let normalized = path.replace('\\', "/");
    let parsed = Path::new(&normalized);
    if normalized.is_empty()
        || parsed.is_absolute()
        || parsed.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(RepoError::UnsafePath(path.into()));
    }
    Ok(normalized.trim_start_matches("./").into())
}

fn parse_status(bytes: &[u8]) -> Result<Status> {
    let mut branch = BranchInfo::default();
    let mut changes = Vec::new();
    let records: Vec<_> = bytes.split(|byte| *byte == 0).collect();
    let mut index = 0;
    while index < records.len() {
        let record = records[index];
        index += 1;
        if record.is_empty() {
            continue;
        }
        let line = utf8(record, "parse repository status")?;
        if let Some(value) = line.strip_prefix("# branch.oid ") {
            branch.oid = (value != "(initial)").then(|| value.into());
        } else if let Some(value) = line.strip_prefix("# branch.head ") {
            branch.name = (value != "(detached)").then(|| value.into());
        } else if let Some(value) = line.strip_prefix("# branch.upstream ") {
            branch.upstream = Some(value.into());
        } else if let Some(value) = line.strip_prefix("# branch.ab ") {
            for part in value.split_whitespace() {
                if let Some(n) = part.strip_prefix('+') {
                    branch.ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    branch.behind = n.parse().unwrap_or(0);
                }
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            let renamed = line.starts_with("2 ");
            let field_count = if renamed { 10 } else { 9 };
            let fields: Vec<_> = line.splitn(field_count, ' ').collect();
            if fields.len() != field_count {
                return Err(RepoError::Malformed(
                    "parse repository status".into(),
                    line.into(),
                ));
            }
            let xy = fields[1].as_bytes();
            let original_path = if renamed {
                let value = records.get(index).ok_or_else(|| {
                    RepoError::Malformed(
                        "parse repository status".into(),
                        "missing rename origin".into(),
                    )
                })?;
                index += 1;
                Some(utf8(value, "parse repository status")?.into())
            } else {
                None
            };
            changes.push(Change {
                path: fields[field_count - 1].into(),
                original_path,
                index: change_kind(*xy.first().unwrap_or(&b'.')),
                worktree: change_kind(*xy.get(1).unwrap_or(&b'.')),
            });
        } else if let Some(path) = line.strip_prefix("? ") {
            changes.push(Change {
                path: path.into(),
                original_path: None,
                index: ChangeKind::Unmodified,
                worktree: ChangeKind::Untracked,
            });
        } else if let Some(path) = line.strip_prefix("! ") {
            changes.push(Change {
                path: path.into(),
                original_path: None,
                index: ChangeKind::Unmodified,
                worktree: ChangeKind::Ignored,
            });
        } else if line.starts_with("u ") {
            let fields: Vec<_> = line.splitn(11, ' ').collect();
            if fields.len() == 11 {
                changes.push(Change {
                    path: fields[10].into(),
                    original_path: None,
                    index: ChangeKind::Unmerged,
                    worktree: ChangeKind::Unmerged,
                });
            }
        }
    }
    Ok(Status { branch, changes })
}

fn change_kind(value: u8) -> ChangeKind {
    match value {
        b'A' => ChangeKind::Added,
        b'M' => ChangeKind::Modified,
        b'D' => ChangeKind::Deleted,
        b'R' => ChangeKind::Renamed,
        b'C' => ChangeKind::Copied,
        b'T' => ChangeKind::TypeChanged,
        b'U' => ChangeKind::Unmerged,
        b'?' => ChangeKind::Untracked,
        b'!' => ChangeKind::Ignored,
        _ => ChangeKind::Unmodified,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn fixture() -> (TempDir, Repository) {
        let temp = TempDir::new().unwrap();
        let run = |args: &[&str]| {
            let output = Command::new("git")
                .current_dir(temp.path())
                .args(args)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        };
        run(&["init", "-b", "main"]);
        run(&["config", "user.name", "Sty Test"]);
        run(&["config", "user.email", "sty@example.invalid"]);
        run(&["config", "commit.gpgsign", "false"]);
        fs::create_dir(temp.path().join("src")).unwrap();
        fs::write(temp.path().join("README.md"), "# Fixture\n").unwrap();
        fs::write(
            temp.path().join("src/lib.rs"),
            "pub fn answer() -> u8 { 42 }\n",
        )
        .unwrap();
        run(&["add", "."]);
        run(&["commit", "-m", "Initial commit"]);
        let repo = Repository::discover(temp.path().join("src")).unwrap();
        (temp, repo)
    }

    #[test]
    fn discovers_and_reads_a_repository() {
        let (_temp, repo) = fixture();
        assert_eq!(repo.status().unwrap().branch.name.as_deref(), Some("main"));
        assert_eq!(repo.commits(None, 10).unwrap()[0].title, "Initial commit");
        assert_eq!(
            repo.read_blob("HEAD", "README.md").unwrap().text(),
            Some("# Fixture\n")
        );
        assert!(
            repo.tree("HEAD", None)
                .unwrap()
                .iter()
                .any(|entry| entry.name == "README.md")
        );
        assert_eq!(
            repo.tree("HEAD", Some("src")).unwrap()[0].path,
            "src/lib.rs"
        );
    }

    #[test]
    fn reports_worktree_changes_and_diffs() {
        let (temp, repo) = fixture();
        fs::write(temp.path().join("README.md"), "# Changed\n").unwrap();
        fs::write(temp.path().join("new.txt"), "new\n").unwrap();
        let status = repo.status().unwrap();
        assert!(
            status
                .changes
                .iter()
                .any(|entry| entry.path == "README.md" && entry.worktree == ChangeKind::Modified)
        );
        assert!(
            status
                .changes
                .iter()
                .any(|entry| entry.path == "new.txt" && entry.worktree == ChangeKind::Untracked)
        );
        assert!(
            repo.diff(None, None, &[], 3)
                .unwrap()
                .patch
                .contains("# Changed")
        );
    }

    #[test]
    fn rejects_paths_that_escape_the_repository() {
        let (_temp, repo) = fixture();
        assert!(matches!(
            repo.read_blob("HEAD", "../secret"),
            Err(RepoError::UnsafePath(_))
        ));
        assert!(matches!(
            repo.diff(None, None, &["C:\\secret".into()], 3),
            Err(RepoError::UnsafePath(_))
        ));
    }
}
