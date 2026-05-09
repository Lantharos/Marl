use std::env;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use anyhow::{Context, Result, anyhow, bail};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use reqwest::blocking::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sty_protocol::{
    AuthCheckResponse, DEFAULT_AVE_CLIENT_ID, StyConfig, TokenResponse, UserProfile,
};
use url::Url;
use uuid::Uuid;

use crate::http::{RequestBuilderExt, response_error};
use crate::spinner;

pub(crate) const DEFAULT_REMOTE_URL: &str = "http://127.0.0.1:8787";

pub(crate) fn login(
    token: Option<String>,
    callback_port: u16,
    remote_url: String,
    pig: String,
) -> Result<()> {
    let (token, user) = match token {
        Some(token) => {
            let user = auth_user(&remote_url, &token)?;
            (token, user)
        }
        None => {
            let client_id =
                env::var("STY_AVE_CLIENT_ID").unwrap_or_else(|_| DEFAULT_AVE_CLIENT_ID.to_string());
            browser_login(&remote_url, &client_id, callback_port)?
        }
    };
    import_pig_auth(&pig, &remote_url, &token)?;
    save_config(&StyConfig {
        remote_url: remote_url.clone(),
        token,
        user,
    })?;
    println!("Logged in to {remote_url}");
    Ok(())
}

pub(crate) fn whoami() -> Result<()> {
    let config = load_config()?;
    let url = format!("{}/v1/auth/check", config.remote_url.trim_end_matches('/'));
    let response = Client::new()
        .post(url)
        .bearer_auth(&config.token)
        .send_request("Checking sty session")?;
    if !response.status().is_success() {
        bail!("auth check failed with status {}", response_error(response));
    }
    let body = response.json::<AuthCheckResponse>()?;
    println!(
        "{} on {}",
        visible_user(&body.user, body.profile.as_ref()),
        config.remote_url
    );
    Ok(())
}

pub(crate) fn load_config() -> Result<StyConfig> {
    let path = config_path()?;
    let bytes = std::fs::read(&path)
        .with_context(|| format!("run `sty login` first; missing {}", path.display()))?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub(crate) fn try_load_config() -> Option<StyConfig> {
    load_config().ok()
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    id_token: String,
}

fn browser_login(
    remote_url: &str,
    client_id: &str,
    callback_port: u16,
) -> Result<(String, String)> {
    let redirect_uri = format!("http://127.0.0.1:{callback_port}/callback");
    let listener = TcpListener::bind(("127.0.0.1", callback_port))
        .with_context(|| format!("could not listen on {redirect_uri}"))?;
    let verifier = pkce_token();
    let state = pkce_token();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut auth_url = Url::parse("https://aveid.net/signin")?;
    auth_url
        .query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", "openid profile email offline_access")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");
    webbrowser::open(auth_url.as_str()).context("could not open browser")?;
    println!("Waiting for Ave login at {redirect_uri}");
    let callback = wait_for_callback(listener)?;
    if callback.state.as_deref() != Some(state.as_str()) {
        bail!("login callback state did not match");
    }
    let code = callback
        .code
        .context("login callback did not include code")?;
    let id_token = exchange_oauth_code(client_id, &redirect_uri, &code, &verifier)?.id_token;
    let sty_token = exchange_sty_token(remote_url, &id_token)?;
    let user = auth_user(remote_url, &sty_token)?;
    Ok((sty_token, user))
}

struct LoginCallback {
    code: Option<String>,
    state: Option<String>,
}

fn wait_for_callback(listener: TcpListener) -> Result<LoginCallback> {
    let (mut stream, _) = listener.accept()?;
    let mut request = [0; 4096];
    let read = stream.read(&mut request)?;
    let request = String::from_utf8_lossy(&request[..read]);
    let line = request.lines().next().context("empty login callback")?;
    let path = line
        .split_whitespace()
        .nth(1)
        .context("invalid login callback")?;
    let url = Url::parse(&format!("http://127.0.0.1{path}"))?;
    let code = url
        .query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string());
    let state = url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.to_string());
    let body = "sty login complete. You can close this.";
    write!(
        stream,
        "HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: {}\r\n\r\n{}",
        body.len(),
        body
    )?;
    Ok(LoginCallback { code, state })
}

fn exchange_oauth_code(
    client_id: &str,
    redirect_uri: &str,
    code: &str,
    verifier: &str,
) -> Result<OAuthTokenResponse> {
    let response = spinner::run("Exchanging Ave token", || {
        Client::new()
            .post("https://api.aveid.net/api/oauth/token")
            .json(&serde_json::json!({
                "grant_type": "authorization_code",
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "code": code,
                "code_verifier": verifier,
            }))
            .send()
    })?;
    if !response.status().is_success() {
        bail!(
            "Ave token exchange failed with status {}",
            response_error(response)
        );
    }
    Ok(response.json()?)
}

fn exchange_sty_token(remote_url: &str, id_token: &str) -> Result<String> {
    let url = format!("{}/v1/session/exchange", remote_url.trim_end_matches('/'));
    let response = spinner::run("Creating sty session", || {
        Client::new()
            .post(url)
            .json(&serde_json::json!({ "id_token": id_token, "client": "cli" }))
            .send()
    })?;
    if !response.status().is_success() {
        bail!(
            "sty session exchange failed with status {}",
            response_error(response)
        );
    }
    Ok(response.json::<TokenResponse>()?.token)
}

fn auth_user(remote_url: &str, token: &str) -> Result<String> {
    let url = format!("{}/v1/auth/check", remote_url.trim_end_matches('/'));
    let response = spinner::run("Checking sty session", || {
        Client::new().post(url).bearer_auth(token).send()
    })?;
    if !response.status().is_success() {
        bail!("auth check failed with status {}", response_error(response));
    }
    let body = response.json::<AuthCheckResponse>()?;
    Ok(visible_user(&body.user, body.profile.as_ref()))
}

fn visible_user(user: &str, profile: Option<&UserProfile>) -> String {
    profile
        .and_then(|profile| profile.handle.as_deref())
        .map(str::trim)
        .filter(|handle| !handle.is_empty())
        .or_else(|| {
            profile
                .map(|profile| profile.display_name.trim())
                .filter(|name| !name.is_empty())
        })
        .unwrap_or(user)
        .to_string()
}

fn pkce_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn import_pig_auth(pig: &str, remote_url: &str, token: &str) -> Result<()> {
    let temp = tempfile::tempdir()?;
    let mut child = Command::new(pig)
        .args(["auth", "import", remote_url, "--token-stdin"])
        .current_dir(temp.path())
        .stdin(Stdio::piped())
        .spawn()
        .with_context(|| format!("failed to run `{pig} auth import`"))?;
    let stdin = child
        .stdin
        .as_mut()
        .ok_or_else(|| anyhow!("failed to open pig stdin"))?;
    writeln!(stdin, "{token}")?;
    let status = child.wait()?;
    if !status.success() {
        bail!("`{pig} auth import` failed");
    }
    Ok(())
}

fn save_config(config: &StyConfig) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(config)?)?;
    Ok(())
}

fn config_path() -> Result<PathBuf> {
    if let Ok(path) = env::var("STY_CONFIG") {
        return Ok(PathBuf::from(path));
    }
    let home = env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .context("could not find USERPROFILE or HOME")?;
    Ok(PathBuf::from(home).join(".sty").join("config.json"))
}
