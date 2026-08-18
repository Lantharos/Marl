pub mod client;
pub mod config;
pub mod docker;
pub mod executor;
pub mod models;
mod process;
pub mod service;

use anyhow::Result;
use client::RunnerClient;
use models::{Registration, RunnerConfig};
use std::path::Path;

pub struct RegisterOptions<'a> {
    pub url: &'a str,
    pub enrollment_token: &'a str,
    pub name: &'a str,
    pub labels: &'a [String],
    pub concurrency: usize,
    pub work_dir: &'a Path,
    pub config_path: &'a Path,
}

pub async fn register(options: RegisterOptions<'_>) -> Result<RunnerConfig> {
    docker::verify().await?;
    let mut labels = options.labels.to_vec();
    if !labels.iter().any(|label| label == "docker") {
        labels.push("docker".to_owned());
    }
    let registration = Registration {
        enrollment_token: options.enrollment_token,
        name: options.name,
        labels: &labels,
        concurrency: options.concurrency,
        platform: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        version: env!("CARGO_PKG_VERSION"),
    };
    let response = RunnerClient::register(options.url, &registration).await?;
    let config = RunnerConfig {
        url: options.url.trim_end_matches('/').to_owned(),
        token: response.token,
        runner_id: response.runner.id,
        name: options.name.to_owned(),
        labels,
        concurrency: options.concurrency,
        work_dir: options.work_dir.to_string_lossy().into_owned(),
    };
    config::save(options.config_path, &config)?;
    Ok(config)
}
