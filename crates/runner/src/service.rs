use crate::process::standard_command;
use anyhow::{Context, Result, bail};
use std::{path::Path, process::Command};

const SERVICE_NAME: &str = "MarlRunner";

pub fn install(config: &Path) -> Result<()> {
    let config = std::fs::canonicalize(config).context("runner config does not exist")?;
    #[cfg(windows)]
    {
        let executable = std::env::current_exe()?;
        let command = format!(
            "\"{}\" runner run --config \"{}\"",
            executable.display(),
            config.display()
        );
        run(standard_command("sc.exe").args([
            "create",
            SERVICE_NAME,
            "binPath=",
            &command,
            "start=",
            "auto",
            "DisplayName=",
            "Marl Runner",
        ]))?;
        run(standard_command("sc.exe").args([
            "description",
            SERVICE_NAME,
            "Runs self-hosted Marl jobs on this machine.",
        ]))?;
        run(standard_command("sc.exe").args([
            "failure",
            SERVICE_NAME,
            "reset=",
            "86400",
            "actions=",
            "restart/5000/restart/15000/restart/60000",
        ]))?;
        run(standard_command("sc.exe").args(["start", SERVICE_NAME]))?;
    }
    #[cfg(target_os = "linux")]
    {
        let executable = std::env::current_exe()?;
        let unit = format!(
            "[Unit]\nDescription=Marl self-hosted runner\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nExecStart={} runner run --config {}\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\n",
            executable.display(),
            config.display()
        );
        std::fs::write("/etc/systemd/system/marl-runner.service", unit)
            .context("could not write the systemd unit; run as root")?;
        run(standard_command("systemctl").args(["daemon-reload"]))?;
        run(standard_command("systemctl").args(["enable", "--now", "marl-runner.service"]))?;
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    bail!("service installation is currently supported on Windows and Linux");
    Ok(())
}

pub fn uninstall() -> Result<()> {
    #[cfg(windows)]
    {
        let _ = standard_command("sc.exe")
            .args(["stop", SERVICE_NAME])
            .status();
        run(standard_command("sc.exe").args(["delete", SERVICE_NAME]))?;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = standard_command("systemctl")
            .args(["disable", "--now", "marl-runner.service"])
            .status();
        std::fs::remove_file("/etc/systemd/system/marl-runner.service")
            .context("could not remove the systemd unit; run as root")?;
        run(standard_command("systemctl").args(["daemon-reload"]))?;
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    bail!("service installation is currently supported on Windows and Linux");
    Ok(())
}

pub fn status() -> Result<()> {
    #[cfg(windows)]
    return run(standard_command("sc.exe").args(["query", SERVICE_NAME]));
    #[cfg(target_os = "linux")]
    return run(standard_command("systemctl").args([
        "status",
        "marl-runner.service",
        "--no-pager",
    ]));
    #[cfg(not(any(windows, target_os = "linux")))]
    bail!("service installation is currently supported on Windows and Linux")
}

fn run(command: &mut Command) -> Result<()> {
    let status = command
        .status()
        .context("could not execute service manager")?;
    if !status.success() {
        bail!("service manager exited with {status}")
    }
    Ok(())
}
