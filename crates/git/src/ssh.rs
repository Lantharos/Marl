use crate::{
    metadata::index_local_repository,
    process::Command,
    receive, remote_storage,
    repository_files::{ensure_bare_repository, repair_head},
    state::{AppState, repository_path, safe_segment},
};
use anyhow::{Context, Result};
use russh::{
    Channel, ChannelId,
    keys::{Algorithm, HashAlg, PrivateKey, load_secret_key, ssh_key::LineEnding},
    server::{self, Msg, Server as _, Session},
};
use serde::Deserialize;
use std::{collections::HashMap, path::Path, process::Stdio, sync::Arc, time::Duration};
use tokio::{
    fs,
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::ChildStdin,
    sync::Mutex,
};

#[derive(Clone)]
struct SshServer {
    state: Arc<AppState>,
}

struct SshSession {
    state: Arc<AppState>,
    fingerprint: Option<String>,
    inputs: HashMap<ChannelId, GitInput>,
}

struct GitInput {
    writer: Arc<Mutex<ChildStdin>>,
    remaining: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Authorization {
    repository_id: String,
    write: bool,
    actor_id: Option<String>,
}

struct GitCommand {
    service: &'static str,
    owner: String,
    repository: String,
}

pub(crate) async fn serve(state: Arc<AppState>, address: String) -> Result<()> {
    let host_key_path = std::env::var("MARL_SSH_HOST_KEY").map_or_else(
        |_| {
            state
                .repositories
                .parent()
                .unwrap_or(Path::new("."))
                .join("ssh_host_ed25519")
        },
        Into::into,
    );
    let host_key = if host_key_path.exists() {
        load_secret_key(&host_key_path, None).context("load SSH host key")?
    } else if !state.local_storage {
        anyhow::bail!("MARL_SSH_HOST_KEY must point to a persistent Ed25519 host key in production")
    } else {
        let key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519)
            .context("generate SSH host key")?;
        key.write_openssh_file(&host_key_path, LineEnding::LF)
            .context("store SSH host key")?;
        key
    };
    let config = Arc::new(server::Config {
        inactivity_timeout: Some(Duration::from_secs(600)),
        auth_rejection_time: Duration::from_secs(1),
        auth_rejection_time_initial: Some(Duration::ZERO),
        keys: vec![host_key],
        ..Default::default()
    });
    println!("Marl SSH Git gateway listening on {address}");
    SshServer { state }
        .run_on_address(config, address)
        .await
        .context("serve SSH Git gateway")
}

impl server::Server for SshServer {
    type Handler = SshSession;

    fn new_client(&mut self, _: Option<std::net::SocketAddr>) -> Self::Handler {
        SshSession {
            state: self.state.clone(),
            fingerprint: None,
            inputs: HashMap::new(),
        }
    }
}

impl server::Handler for SshSession {
    type Error = anyhow::Error;

    async fn auth_publickey(
        &mut self,
        _: &str,
        key: &russh::keys::PublicKey,
    ) -> Result<server::Auth> {
        let fingerprint = key.fingerprint(HashAlg::Sha256).to_string();
        let response = self
            .state
            .client
            .get(format!(
                "{}/api/v1/git/ssh/authorize",
                self.state.control_plane
            ))
            .query(&[("fingerprint", &fingerprint)])
            .header("x-marl-gateway-token", &self.state.gateway_token)
            .send()
            .await
            .context("authenticate SSH key")?;
        if response.status().is_success() {
            self.fingerprint = Some(fingerprint);
            Ok(server::Auth::Accept)
        } else {
            Ok(server::Auth::reject())
        }
    }

    async fn channel_open_session(
        &mut self,
        _: Channel<Msg>,
        reply: server::ChannelOpenHandle,
        _: &mut Session,
    ) -> Result<()> {
        reply.accept().await;
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<()> {
        let Some(command) = parse_command(data) else {
            session.channel_failure(channel)?;
            session.data(
                channel,
                "Only Git upload-pack and receive-pack commands are supported.\n",
            )?;
            session.eof(channel)?;
            return Ok(());
        };
        let Some(fingerprint) = self.fingerprint.as_ref() else {
            session.channel_failure(channel)?;
            return Ok(());
        };
        let response = self
            .state
            .client
            .get(format!(
                "{}/api/v1/git/ssh/authorize",
                self.state.control_plane
            ))
            .query(&[
                ("fingerprint", fingerprint.as_str()),
                ("owner", command.owner.as_str()),
                ("repository", command.repository.as_str()),
                ("service", command.service),
            ])
            .header("x-marl-gateway-token", &self.state.gateway_token)
            .send()
            .await
            .context("authorize SSH Git command")?;
        if !response.status().is_success() {
            session.channel_failure(channel)?;
            session.data(channel, "Repository access denied.\n")?;
            session.eof(channel)?;
            return Ok(());
        }
        let authorization = response
            .json::<Authorization>()
            .await
            .context("decode SSH authorization")?;
        if command.service == "git-receive-pack" && !authorization.write {
            session.channel_failure(channel)?;
            return Ok(());
        }
        let repository_guard = self
            .state
            .lock_repository(&command.owner, &command.repository)
            .await;
        let snapshot = if self.state.local_storage {
            None
        } else {
            match remote_storage::hydrate(
                &self.state,
                &command.owner,
                &command.repository,
                authorization.actor_id.as_deref(),
            )
            .await
            {
                Ok(snapshot) => Some(snapshot),
                Err(error) => {
                    eprintln!("SSH canonical repository hydration failed: {error:#}");
                    session.channel_failure(channel)?;
                    session.extended_data(
                        channel,
                        1,
                        "Repository storage is temporarily unavailable.\n",
                    )?;
                    session.eof(channel)?;
                    return Ok(());
                }
            }
        };
        let repository = repository_path(
            &self.state.repositories,
            &command.owner,
            &command.repository,
        )?;
        ensure_bare_repository(&repository).await?;
        let receives_pack = command.service == "git-receive-pack";
        let mut child_command = Command::new(command.service);
        child_command
            .arg(&repository)
            .env_clear()
            .env("PATH", std::env::var_os("PATH").unwrap_or_default())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        receive::configure(&mut child_command, receives_pack);
        let mut child = child_command.spawn().context("start SSH Git process")?;
        let input = child.stdin.take().context("open SSH Git stdin")?;
        let stdout = child.stdout.take().context("open SSH Git stdout")?;
        let stderr = child.stderr.take().context("open SSH Git stderr")?;
        self.inputs.insert(
            channel,
            GitInput {
                writer: Arc::new(Mutex::new(input)),
                remaining: receives_pack.then_some(receive::MAX_REQUEST_BYTES),
            },
        );
        let handle = session.handle();
        tokio::spawn(copy_output(stdout, handle.clone(), channel, false));
        tokio::spawn(copy_output(stderr, handle.clone(), channel, true));
        let state = self.state.clone();
        tokio::spawn(async move {
            let status = child.wait().await;
            let mut succeeded = status.as_ref().is_ok_and(|status| status.success());
            if receives_pack && succeeded {
                if let Err(error) = repair_head(&repository).await {
                    eprintln!("SSH Git push HEAD repair failed: {error:#}");
                }
                let publication = if state.local_storage {
                    index_local_repository(
                        &state,
                        authorization.repository_id,
                        command.owner,
                        command.repository,
                        authorization.actor_id,
                    )
                    .await
                } else {
                    remote_storage::publish(
                        state.clone(),
                        command.owner,
                        command.repository,
                        authorization.actor_id,
                        snapshot.expect("production SSH hydration snapshot missing"),
                    )
                    .await
                };
                if let Err(error) = publication {
                    succeeded = false;
                    eprintln!("SSH Git push publication failed: {error:#}");
                    let _ = handle
                        .extended_data(
                            channel,
                            1,
                            b"Push could not be committed to canonical storage. Fetch and retry.\n"
                                .to_vec(),
                        )
                        .await;
                }
                if !state.local_storage {
                    let _ = fs::remove_file(repository.join("marl-generation")).await;
                }
            }
            drop(repository_guard);
            let _ = handle
                .exit_status_request(
                    channel,
                    if succeeded {
                        0
                    } else {
                        status
                            .ok()
                            .and_then(|value| value.code())
                            .unwrap_or(1)
                            .max(1) as u32
                    },
                )
                .await;
            let _ = handle.eof(channel).await;
            let _ = handle.close(channel).await;
        });
        session.channel_success(channel)?;
        Ok(())
    }

    async fn data(&mut self, channel: ChannelId, data: &[u8], session: &mut Session) -> Result<()> {
        let Some((writer, exceeds_limit)) = self.inputs.get_mut(&channel).map(|input| {
            let exceeds_limit = input
                .remaining
                .is_some_and(|remaining| data.len() as u64 > remaining);
            if !exceeds_limit && let Some(remaining) = input.remaining.as_mut() {
                *remaining -= data.len() as u64;
            }
            (input.writer.clone(), exceeds_limit)
        }) else {
            return Ok(());
        };
        if exceeds_limit {
            self.inputs.remove(&channel);
            writer.lock().await.shutdown().await?;
            session.extended_data(channel, 1, "Push request exceeds the 256 MiB pack limit.\n")?;
            return Ok(());
        }
        writer.lock().await.write_all(data).await?;
        Ok(())
    }

    async fn channel_eof(&mut self, channel: ChannelId, _: &mut Session) -> Result<()> {
        if let Some(input) = self.inputs.remove(&channel) {
            input.writer.lock().await.shutdown().await?;
        }
        Ok(())
    }

    async fn channel_close(&mut self, channel: ChannelId, session: &mut Session) -> Result<()> {
        self.channel_eof(channel, session).await
    }
}

async fn copy_output(
    mut reader: impl AsyncRead + Unpin,
    handle: server::Handle,
    channel: ChannelId,
    stderr: bool,
) {
    let mut buffer = vec![0; 32 * 1024];
    while let Ok(read) = reader.read(&mut buffer).await {
        if read == 0 {
            break;
        }
        if stderr {
            if handle
                .extended_data(channel, 1, buffer[..read].to_vec())
                .await
                .is_err()
            {
                break;
            }
        } else if handle.data(channel, buffer[..read].to_vec()).await.is_err() {
            break;
        }
    }
}

fn parse_command(data: &[u8]) -> Option<GitCommand> {
    let command = std::str::from_utf8(data).ok()?.trim();
    let (service, path) = command.split_once(' ')?;
    let service = match service {
        "git-upload-pack" => "git-upload-pack",
        "git-receive-pack" => "git-receive-pack",
        _ => return None,
    };
    let path = path
        .trim()
        .trim_matches(|character| character == '\'' || character == '"')
        .trim_start_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);
    let (owner, repository) = path.split_once('/')?;
    if !safe_segment(owner) || !safe_segment(repository) || repository.contains('/') {
        return None;
    }
    Some(GitCommand {
        service,
        owner: owner.into(),
        repository: repository.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_git_service_commands() {
        let command = parse_command(b"git-upload-pack 'lantharos/marl.git'").unwrap();
        assert_eq!(command.owner, "lantharos");
        assert_eq!(command.repository, "marl");
        assert!(parse_command(b"sh -c whoami").is_none());
        assert!(parse_command(b"git-receive-pack '../marl.git'").is_none());
    }
}
