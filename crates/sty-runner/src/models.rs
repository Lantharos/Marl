use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerConfig {
    pub url: String,
    pub token: String,
    pub runner_id: String,
    pub name: String,
    pub labels: Vec<String>,
    pub concurrency: usize,
    pub work_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Registration<'a> {
    pub enrollment_token: &'a str,
    pub name: &'a str,
    pub labels: &'a [String],
    pub concurrency: usize,
    pub platform: &'a str,
    pub architecture: &'a str,
    pub version: &'a str,
}

#[derive(Debug, Deserialize)]
pub struct RegistrationResponse {
    pub runner: RegisteredRunner,
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisteredRunner {
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct ClaimResponse {
    pub job: JobLease,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobLease {
    pub id: String,
    pub lease_token: String,
    pub run: RunIdentity,
    pub repository: RepositoryIdentity,
    pub branch: String,
    pub commit_id: String,
    pub steps: Vec<JobStep>,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
    #[serde(default)]
    pub artifact_paths: Vec<String>,
    pub runtime: JobRuntime,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RunIdentity {
    pub number: u64,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryIdentity {
    pub owner: String,
    pub name: String,
    pub clone_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStep {
    pub name: String,
    pub run: String,
    pub shell: Option<String>,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
    pub working_directory: Option<String>,
    pub timeout_minutes: Option<u64>,
    #[serde(default)]
    pub continue_on_error: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRuntime {
    pub image: String,
    pub timeout_minutes: u64,
    #[serde(default)]
    pub services: Vec<JobService>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JobService {
    pub name: String,
    pub image: String,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct Renewal {
    pub canceled: bool,
}
