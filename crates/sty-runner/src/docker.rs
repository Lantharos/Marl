use crate::models::{JobLease, JobStep};
use anyhow::{Context, Result, bail};
use std::{collections::BTreeMap, path::Path, process::Stdio};
use tokio::process::{Child, Command};

pub struct DockerSandbox {
    container: String,
    network: String,
    services: Vec<String>,
}

impl DockerSandbox {
    pub async fn create(job: &JobLease, workspace: &Path, cache: &Path) -> Result<Self> {
        verify().await?;
        let suffix = job
            .id
            .strip_prefix("job_")
            .unwrap_or(&job.id)
            .to_lowercase();
        let mut sandbox = Self {
            container: format!("sty-job-{suffix}"),
            network: format!("sty-job-{suffix}"),
            services: Vec::new(),
        };
        let result = sandbox.prepare(job, workspace, cache).await;
        if let Err(error) = result {
            sandbox.remove().await;
            return Err(error);
        }
        Ok(sandbox)
    }

    async fn prepare(&mut self, job: &JobLease, workspace: &Path, cache: &Path) -> Result<()> {
        pull(&job.runtime.image).await?;
        checked(
            Command::new("docker").args(["network", "create", &self.network]),
            "create job network",
        )
        .await?;
        for service in &job.runtime.services {
            pull(&service.image).await?;
            let name = format!("{}-{}", self.container, service.name);
            let mut command = Command::new("docker");
            command.args([
                "run",
                "--detach",
                "--name",
                &name,
                "--network",
                &self.network,
                "--network-alias",
                &service.name,
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges",
                "--pids-limit",
                "256",
            ]);
            add_environment(&mut command, &service.environment);
            command.arg(&service.image);
            checked(&mut command, &format!("start service {}", service.name)).await?;
            self.services.push(name);
        }
        let workspace_mount = format!("{}:/workspace", workspace.display());
        let cache_mount = format!("{}:/sty-cache", cache.display());
        let mut command = Command::new("docker");
        command.args([
            "create",
            "--name",
            &self.container,
            "--network",
            &self.network,
            "--workdir",
            "/workspace",
            "--volume",
            &workspace_mount,
            "--volume",
            &cache_mount,
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--pids-limit",
            "512",
            "--memory",
            "4g",
            "--cpus",
            "2",
            "--entrypoint",
            "/bin/sh",
            &job.runtime.image,
            "-c",
            "trap 'exit 0' TERM INT; while :; do sleep 3600 & wait $!; done",
        ]);
        checked(&mut command, "create job container").await?;
        checked(
            Command::new("docker").args(["start", &self.container]),
            "start job container",
        )
        .await?;
        Ok(())
    }

    pub fn step(&self, job: &JobLease, step: &JobStep) -> Result<Child> {
        let shell = step.shell.as_deref().unwrap_or("bash");
        let working_directory = step
            .working_directory
            .as_deref()
            .map(|path| format!("/workspace/{path}"))
            .unwrap_or_else(|| "/workspace".to_owned());
        let mut environment = job.environment.clone();
        environment.extend(step.environment.clone());
        environment.extend([
            ("CI".to_owned(), "true".to_owned()),
            ("STY".to_owned(), "true".to_owned()),
            ("STY_RUN_NUMBER".to_owned(), job.run.number.to_string()),
            ("STY_COMMIT".to_owned(), job.commit_id.clone()),
            ("STY_BRANCH".to_owned(), job.branch.clone()),
            ("STY_CACHE_DIR".to_owned(), "/sty-cache".to_owned()),
        ]);
        let mut command = Command::new("docker");
        command.args(["exec", "--workdir", &working_directory]);
        add_environment(&mut command, &environment);
        command.arg(&self.container).arg(shell);
        match shell {
            "powershell" | "pwsh" => {
                command.args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    &step.run,
                ]);
            }
            "cmd" => {
                command.args(["/D", "/S", "/C", &step.run]);
            }
            "sh" | "bash" => {
                command.args(["-e", "-c", &step.run]);
            }
            _ => bail!("unsupported container shell {shell}"),
        }
        command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("could not start container step {}", step.name))
    }

    pub async fn kill(&self) {
        let _ = Command::new("docker")
            .args(["kill", &self.container])
            .status()
            .await;
    }

    pub async fn remove(&self) {
        let _ = Command::new("docker")
            .args(["rm", "--force", &self.container])
            .status()
            .await;
        for service in &self.services {
            let _ = Command::new("docker")
                .args(["rm", "--force", service])
                .status()
                .await;
        }
        let _ = Command::new("docker")
            .args(["network", "rm", &self.network])
            .status()
            .await;
    }
}

fn add_environment(command: &mut Command, values: &BTreeMap<String, String>) {
    for (key, value) in values {
        command.env(key, value).args(["--env", key]);
    }
}

pub async fn verify() -> Result<()> {
    checked(
        Command::new("docker").args(["version", "--format", "{{.Server.Version}}"]),
        "connect to Docker",
    )
    .await
    .map(|_| ())
}

async fn pull(image: &str) -> Result<()> {
    if Command::new("docker")
        .args(["image", "inspect", image])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await?
        .success()
    {
        return Ok(());
    }
    checked(
        Command::new("docker").args(["pull", image]),
        &format!("pull image {image}"),
    )
    .await
    .map(|_| ())
}

async fn checked(command: &mut Command, operation: &str) -> Result<Vec<u8>> {
    let output = command
        .output()
        .await
        .with_context(|| format!("could not {operation}"))?;
    if !output.status.success() {
        bail!(
            "could not {operation}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )
    }
    Ok(output.stdout)
}
