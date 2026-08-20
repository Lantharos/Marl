use crate::models::{
    ClaimResponse, JobLease, Registration, RegistrationResponse, Renewal, RunnerConfig,
};
use anyhow::{Context, Result, bail};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
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
                .user_agent(format!("marl-runner/{}", env!("CARGO_PKG_VERSION")))
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
            .context("could not reach Marl")?;
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
        let bytes = redact(bytes, &job.mask_values);
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
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct BeginArtifact<'a> {
            name: &'a str,
            byte_size: u64,
            content_type: &'a str,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Upload {
            id: String,
            part_bytes: u64,
            part_count: u32,
        }
        #[derive(Deserialize)]
        struct BeginResponse {
            completed: bool,
            upload: Option<Upload>,
        }
        let file = tokio::fs::File::open(path).await?;
        let size = file.metadata().await?.len();
        drop(file);
        let response = self
            .lease(
                self.http.post(format!(
                    "{}/api/v1/runner/jobs/{}/artifacts",
                    self.base, job.id
                )),
                job,
            )
            .json(&BeginArtifact {
                name,
                byte_size: size,
                content_type: "application/octet-stream",
            })
            .send()
            .await?;
        let begun =
            response_json::<BeginResponse>(response, "artifact upload initialization").await?;
        if begun.completed {
            return Ok(());
        }
        let upload = begun.upload.context("artifact upload layout unavailable")?;
        for part_number in 1..=upload.part_count {
            if self.renew(job).await?.canceled {
                bail!("job canceled while uploading artifacts")
            }
            let offset = u64::from(part_number - 1) * upload.part_bytes;
            let length = (size - offset).min(upload.part_bytes);
            let mut part = tokio::fs::File::open(path).await?;
            part.seek(std::io::SeekFrom::Start(offset)).await?;
            self.lease(
                self.http.put(format!(
                    "{}/api/v1/runner/jobs/{}/artifacts/{}/parts/{part_number}",
                    self.base, job.id, upload.id
                )),
                job,
            )
            .header(reqwest::header::CONTENT_LENGTH, length)
            .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
            .body(reqwest::Body::wrap_stream(ReaderStream::new(
                part.take(length),
            )))
            .send()
            .await?
            .error_for_status()
            .context("artifact part upload failed")?;
        }
        if self.renew(job).await?.canceled {
            bail!("job canceled while completing artifacts")
        }
        self.lease(
            self.http.post(format!(
                "{}/api/v1/runner/jobs/{}/artifacts/{}/complete",
                self.base, job.id, upload.id
            )),
            job,
        )
        .send()
        .await?
        .error_for_status()
        .context("artifact completion failed")?;
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
            .header("x-marl-job-lease", &job.lease_token)
    }
}

fn redact(bytes: Vec<u8>, values: &[String]) -> Vec<u8> {
    if values.is_empty() {
        return bytes;
    }
    let mut text = String::from_utf8_lossy(&bytes).into_owned();
    let mut ordered = values
        .iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    ordered.sort_by_key(|value| std::cmp::Reverse(value.len()));
    for value in ordered {
        text = text.replace(value, "***");
    }
    text.into_bytes()
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

#[cfg(test)]
mod tests {
    use super::redact;

    #[test]
    fn masks_overlapping_secret_values_before_upload() {
        let output = redact(
            b"token=secret-value short=secret".to_vec(),
            &["secret".into(), "secret-value".into()],
        );
        assert_eq!(String::from_utf8(output).unwrap(), "token=*** short=***");
    }
}
