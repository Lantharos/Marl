use crate::models::{
    ClaimResponse, JobLease, Registration, RegistrationResponse, Renewal, RunnerConfig,
};
use anyhow::{Context, Result, bail};
use reqwest::{Client, StatusCode};
use serde::Serialize;
use std::path::Path;
use tokio_util::io::ReaderStream;

#[derive(Clone)]
pub struct RunnerClient {
    http: Client,
    base: String,
    token: String,
}

impl RunnerClient {
    pub fn new(config: &RunnerConfig) -> Result<Self> {
        Ok(Self {
            http: Client::builder()
                .user_agent(format!("sty-runner/{}", env!("CARGO_PKG_VERSION")))
                .build()?,
            base: config.url.trim_end_matches('/').to_owned(),
            token: config.token.clone(),
        })
    }

    pub async fn register(
        base: &str,
        registration: &Registration<'_>,
    ) -> Result<RegistrationResponse> {
        let response = Client::new()
            .post(format!(
                "{}/api/v1/runner/register",
                base.trim_end_matches('/')
            ))
            .json(registration)
            .send()
            .await
            .context("could not reach Sty")?;
        response_json(response, "runner registration").await
    }

    pub async fn heartbeat(&self) -> Result<()> {
        self.authorized(
            self.http
                .post(format!("{}/api/v1/runner/heartbeat", self.base)),
        )
        .send()
        .await?
        .error_for_status()
        .context("runner heartbeat failed")?;
        Ok(())
    }

    pub async fn claim(&self) -> Result<Option<JobLease>> {
        let response = self
            .authorized(self.http.post(format!("{}/api/v1/runner/claim", self.base)))
            .send()
            .await?;
        if response.status() == StatusCode::NO_CONTENT {
            return Ok(None);
        }
        Ok(Some(
            response_json::<ClaimResponse>(response, "job claim")
                .await?
                .job,
        ))
    }

    pub async fn renew(&self, job: &JobLease) -> Result<Renewal> {
        let response = self
            .lease(
                self.http
                    .post(format!("{}/api/v1/runner/jobs/{}/renew", self.base, job.id)),
                job,
            )
            .send()
            .await?;
        response_json(response, "job lease renewal").await
    }

    pub async fn log(&self, job: &JobLease, sequence: u64, bytes: Vec<u8>) -> Result<()> {
        self.lease(
            self.http.put(format!(
                "{}/api/v1/runner/jobs/{}/logs/{sequence}",
                self.base, job.id
            )),
            job,
        )
        .header(reqwest::header::CONTENT_LENGTH, bytes.len())
        .body(bytes)
        .send()
        .await?
        .error_for_status()
        .context("log upload failed")?;
        Ok(())
    }

    pub async fn artifact(&self, job: &JobLease, name: &str, path: &Path) -> Result<()> {
        let file = tokio::fs::File::open(path).await?;
        let size = file.metadata().await?.len();
        let response = self
            .lease(
                self.http.put(format!(
                    "{}/api/v1/runner/jobs/{}/artifacts/{}",
                    self.base,
                    job.id,
                    percent_encode(name)
                )),
                job,
            )
            .header(reqwest::header::CONTENT_LENGTH, size)
            .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
            .body(reqwest::Body::wrap_stream(ReaderStream::new(file)))
            .send()
            .await?;
        response
            .error_for_status()
            .context("artifact upload failed")?;
        Ok(())
    }

    pub async fn complete(
        &self,
        job: &JobLease,
        state: &str,
        exit_code: i32,
        summary: &str,
    ) -> Result<()> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Completion<'a> {
            state: &'a str,
            exit_code: i32,
            summary: &'a str,
        }
        let response = self
            .lease(
                self.http.post(format!(
                    "{}/api/v1/runner/jobs/{}/complete",
                    self.base, job.id
                )),
                job,
            )
            .json(&Completion {
                state,
                exit_code,
                summary,
            })
            .send()
            .await?;
        response
            .error_for_status()
            .context("job completion failed")?;
        Ok(())
    }

    fn authorized(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        request.bearer_auth(&self.token)
    }

    fn lease(&self, request: reqwest::RequestBuilder, job: &JobLease) -> reqwest::RequestBuilder {
        self.authorized(request)
            .header("x-sty-job-lease", &job.lease_token)
    }
}

async fn response_json<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
    operation: &str,
) -> Result<T> {
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        bail!("{operation} failed ({status}): {body}")
    }
    response
        .json()
        .await
        .with_context(|| format!("{operation} returned an invalid response"))
}

fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.') {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}
