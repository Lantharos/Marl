use anyhow::{Context, Result, bail};
use std::{path::Path, process::Command};

const SERVICE_NAME: &str = "StyRunner";

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
        run(Command::new("sc.exe").args([
            "create",
            SERVICE_NAME,
            "binPath=",
            &command,
            "start=",
            "auto",
            "DisplayName=",
            "Sty Runner",
        ]))?;
        run(Command::new("sc.exe").args([
            "description",
            SERVICE_NAME,
            "Runs self-hosted Sty jobs on this machine.",
        ]))?;
        run(Command::new("sc.exe").args([
            "failure",
            SERVICE_NAME,
            "reset=",
            "86400",
            "actions=",
            "restart/5000/restart/15000/restart/60000",
        ]))?;
        run(Command::new("sc.exe").args(["start", SERVICE_NAME]))?;
    }
    #[cfg(target_os = "linux")]
    {
        let executable = std::env::current_exe()?;
        let unit = format!(
            "[Unit]\nDescription=Sty self-hosted runner\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nExecStart={} runner run --config {}\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\n",
            executable.display(),
            config.display()
        );
        std::fs::write("/etc/systemd/system/sty-runner.service", unit)
            .context("could not write the systemd unit; run as root")?;
        run(Command::new("systemctl").args(["daemon-reload"]))?;
        run(Command::new("systemctl").args(["enable", "--now", "sty-runner.service"]))?;
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    bail!("service installation is currently supported on Windows and Linux");
    Ok(())
}

pub fn uninstall() -> Result<()> {
    #[cfg(windows)]
    {
        let _ = Command::new("sc.exe").args(["stop", SERVICE_NAME]).status();
        run(Command::new("sc.exe").args(["delete", SERVICE_NAME]))?;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("systemctl")
            .args(["disable", "--now", "sty-runner.service"])
            .status();
        std::fs::remove_file("/etc/systemd/system/sty-runner.service")
            .context("could not remove the systemd unit; run as root")?;
        run(Command::new("systemctl").args(["daemon-reload"]))?;
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    bail!("service installation is currently supported on Windows and Linux");
    Ok(())
}

pub fn status() -> Result<()> {
    #[cfg(windows)]
    return run(Command::new("sc.exe").args(["query", SERVICE_NAME]));
    #[cfg(target_os = "linux")]
    return run(Command::new("systemctl").args(["status", "sty-runner.service", "--no-pager"]));
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
