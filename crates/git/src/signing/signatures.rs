use crate::{process::Command, state::AppState};
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, io::Write, path::Path, process::Stdio};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

pub(crate) const POLICY_BATCH: usize = 80;

#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SigningMode {
    Optional,
    Vigilant,
    Firewall,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SigningPolicy {
    pub(crate) repository_mode: SigningMode,
    pub(crate) identities: Vec<SigningIdentity>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SigningIdentity {
    pub(crate) user_id: String,
    pub(crate) email: String,
    pub(crate) mode: SigningMode,
    keys: Vec<SigningKey>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SigningKey {
    public_key: String,
    fingerprint: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommitIdentity {
    pub(crate) id: String,
    pub(crate) author_email: String,
    pub(crate) ssh_signed: bool,
}

pub(crate) struct Verification {
    pub(crate) status: &'static str,
    pub(crate) signer_id: Option<String>,
    pub(crate) fingerprint: Option<String>,
}

impl Verification {
    fn unverified(status: &'static str) -> Self {
        Self {
            status,
            signer_id: None,
            fingerprint: None,
        }
    }
}

pub(crate) async fn read_commit_identities(
    repository: &Path,
    ids: &[String],
) -> Result<Vec<CommitIdentity>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut child = Command::new("git")
        .args(["--no-replace-objects", "-C"])
        .arg(repository)
        .args(["cat-file", "--batch"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .context("start commit identity scan")?;
    let mut input = child.stdin.take().context("open identity scan input")?;
    let mut output = BufReader::new(child.stdout.take().context("open identity scan output")?);
    let mut commits = Vec::with_capacity(ids.len());
    for id in ids {
        if !crate::state::is_object_id(id) {
            bail!("invalid commit identifier");
        }
        input.write_all(format!("{id}\n").as_bytes()).await?;
        let mut header = String::new();
        output.read_line(&mut header).await?;
        let fields = header.split_whitespace().collect::<Vec<_>>();
        if fields.len() != 3 || fields[0] != id || fields[1] != "commit" {
            bail!("unexpected commit identity scan object");
        }
        let size = fields[2].parse::<usize>()?;
        if size > 16 * 1024 * 1024 {
            bail!("commit exceeds the 16 MiB signing inspection limit");
        }
        let mut content = vec![0; size];
        output.read_exact(&mut content).await?;
        let mut newline = [0];
        output.read_exact(&mut newline).await?;
        let header_end = content
            .windows(2)
            .position(|bytes| bytes == b"\n\n")
            .context("commit headers are incomplete")?;
        let headers = &content[..header_end];
        let author = headers
            .split(|byte| *byte == b'\n')
            .find_map(|line| line.strip_prefix(b"author "))
            .context("commit author is missing")?;
        let start = author
            .iter()
            .rposition(|byte| *byte == b'<')
            .context("commit author email is missing")?
            + 1;
        let end = author[start..]
            .iter()
            .position(|byte| *byte == b'>')
            .context("commit author email is incomplete")?
            + start;
        let email = std::str::from_utf8(&author[start..end])?
            .trim()
            .to_lowercase();
        if email.len() > 320 {
            bail!("commit author email is too long");
        }
        let ssh_signed = headers.split(|byte| *byte == b'\n').any(|line| {
            line == b"gpgsig -----BEGIN SSH SIGNATURE-----"
                || line == b"gpgsig-sha256 -----BEGIN SSH SIGNATURE-----"
        });
        commits.push(CommitIdentity {
            id: id.clone(),
            author_email: email,
            ssh_signed,
        });
    }
    drop(input);
    if !child.wait().await?.success() {
        bail!("commit identity scan failed");
    }
    Ok(commits)
}

pub(crate) async fn load_policy(
    state: &AppState,
    repository_id: Option<&str>,
    emails: &[String],
) -> Result<SigningPolicy> {
    let mut body = serde_json::json!({ "emails": emails });
    if let Some(id) = repository_id {
        body["repositoryId"] = id.into();
    }
    state
        .client
        .post(format!("{}/api/v1/git/signing-policy", state.control_plane))
        .header("x-marl-gateway-token", &state.gateway_token)
        .json(&body)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .context("load commit signing policy")?
        .error_for_status()
        .context("commit signing policy is unavailable")?
        .json()
        .await
        .context("decode commit signing policy")
}

pub(crate) struct SignatureVerifier {
    policy: SigningPolicy,
    signers: HashMap<String, tempfile::NamedTempFile>,
}

impl SignatureVerifier {
    pub(crate) fn new(policy: SigningPolicy) -> Self {
        Self {
            policy,
            signers: HashMap::new(),
        }
    }

    pub(crate) async fn verify(
        &mut self,
        repository: &Path,
        commit: &CommitIdentity,
    ) -> Result<Verification> {
        if !commit.ssh_signed {
            return Ok(Verification::unverified("unverified"));
        }
        let Some(identity) = self
            .policy
            .identities
            .iter()
            .find(|identity| identity.email == commit.author_email)
        else {
            return Ok(Verification::unverified("unverified"));
        };
        if identity.keys.is_empty() {
            return Ok(Verification::unverified("unverified"));
        }
        if !self.signers.contains_key(&identity.email) {
            let mut allowed =
                tempfile::NamedTempFile::new().context("create allowed signers file")?;
            for key in &identity.keys {
                writeln!(
                    allowed,
                    "{} namespaces=\"git\" {}",
                    identity.user_id, key.public_key
                )?;
            }
            allowed.flush()?;
            self.signers.insert(identity.email.clone(), allowed);
        }
        let allowed = &self.signers[&identity.email];
        let output = Command::new("git")
            .args(["--no-replace-objects", "-C"])
            .arg(repository)
            .args(["-c", "gpg.format=ssh", "-c"])
            .arg(format!(
                "gpg.ssh.allowedSignersFile={}",
                allowed.path().display()
            ))
            .args(["verify-commit", "--raw", &commit.id])
            .env("LC_ALL", "C")
            .stdin(Stdio::null())
            .output()
            .await
            .context("verify commit signature")?;
        if !output.status.success() {
            return Ok(Verification::unverified("invalid"));
        }
        let text = String::from_utf8_lossy(&output.stderr);
        let Some(key) = identity.keys.iter().find(|key| {
            text.split_whitespace()
                .any(|word| word.trim_matches('"') == key.fingerprint)
        }) else {
            return Ok(Verification::unverified("invalid"));
        };
        Ok(Verification {
            status: "verified",
            signer_id: Some(identity.user_id.clone()),
            fingerprint: Some(key.fingerprint.clone()),
        })
    }

    pub(crate) async fn enforce(
        &mut self,
        repository: &Path,
        commits: &[CommitIdentity],
    ) -> Result<()> {
        for commit in commits {
            let personal = self.policy.identities.iter().any(|identity| {
                identity.email == commit.author_email && identity.mode == SigningMode::Firewall
            });
            if self.policy.repository_mode != SigningMode::Firewall && !personal {
                continue;
            }
            if self.verify(repository, commit).await?.status != "verified" {
                bail!(
                    "Signing firewall rejected commit {}: a valid SSH signature from its author's registered key is required. Check your verified email and signing key in Marl settings.",
                    &commit.id[..12]
                );
            }
        }
        Ok(())
    }
}

pub(crate) async fn enforce_commits(
    state: &AppState,
    repository_id: &str,
    repository: &Path,
    ids: &[String],
) -> Result<()> {
    for batch in ids.chunks(POLICY_BATCH) {
        let commits = read_commit_identities(repository, batch).await?;
        let emails = commits
            .iter()
            .map(|commit| commit.author_email.clone())
            .collect::<Vec<_>>();
        let policy = load_policy(state, Some(repository_id), &emails).await?;
        SignatureVerifier::new(policy)
            .enforce(repository, &commits)
            .await?;
    }
    Ok(())
}
