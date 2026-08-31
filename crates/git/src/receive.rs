use crate::process::Command;

pub(crate) const MAX_PACK_BYTES: u64 = 256 * 1024 * 1024;
pub(crate) const MAX_REQUEST_BYTES: u64 = MAX_PACK_BYTES + 1024 * 1024;

pub(crate) fn configure(command: &mut Command, receives_pack: bool) {
    command
        .env("GIT_CONFIG_COUNT", if receives_pack { "2" } else { "1" })
        .env("GIT_CONFIG_KEY_0", "transfer.hideRefs")
        .env("GIT_CONFIG_VALUE_0", "refs/marl/");
    if receives_pack {
        command
            .env("GIT_CONFIG_KEY_1", "receive.maxInputSize")
            .env("GIT_CONFIG_VALUE_1", MAX_PACK_BYTES.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::Path,
        process::{Command as StdCommand, Stdio},
    };

    #[tokio::test]
    async fn hides_server_owned_refs_from_git_transfers() {
        let directory = tempfile::tempdir().unwrap();
        git(directory.path(), &["init", "--bare"]);
        let tree = git_output(directory.path(), &["mktree"]);
        let commit = git_output(directory.path(), &["commit-tree", &tree, "-m", "initial"]);
        git(
            directory.path(),
            &["update-ref", "refs/heads/main", &commit],
        );
        git(
            directory.path(),
            &["update-ref", "refs/marl/pulls/1/head", &commit],
        );

        for (service, receives_pack) in [("upload-pack", false), ("receive-pack", true)] {
            let mut command = Command::new("git");
            command
                .arg(service)
                .arg("--advertise-refs")
                .arg(directory.path())
                .env_clear()
                .env("PATH", std::env::var_os("PATH").unwrap_or_default());
            configure(&mut command, receives_pack);
            let output = command.output().await.unwrap();
            assert!(output.status.success());
            let advertisement = String::from_utf8_lossy(&output.stdout);
            assert!(advertisement.contains("refs/heads/main"));
            assert!(!advertisement.contains("refs/marl/"));
        }
    }

    fn git(repository: &Path, arguments: &[&str]) {
        let output = git_command(repository, arguments).output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn git_output(repository: &Path, arguments: &[&str]) -> String {
        let output = git_command(repository, arguments).output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).unwrap().trim().to_owned()
    }

    fn git_command(repository: &Path, arguments: &[&str]) -> StdCommand {
        let mut command = StdCommand::new("git");
        command
            .arg("--git-dir")
            .arg(repository)
            .args(arguments)
            .env("GIT_AUTHOR_NAME", "Marl")
            .env("GIT_AUTHOR_EMAIL", "marl@example.invalid")
            .env("GIT_COMMITTER_NAME", "Marl")
            .env("GIT_COMMITTER_EMAIL", "marl@example.invalid")
            .stdin(Stdio::null());
        command
    }
}
