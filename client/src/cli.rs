use std::env;
use std::io::Read;
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use anyhow::{Context, Result, anyhow, bail};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use clap::{Parser, Subcommand};
use reqwest::blocking::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sty_protocol::{
    AuthCheckResponse, DEFAULT_AVE_CLIENT_ID, ProjectsResponse, StyConfig, TokenResponse,
    validate_target,
};
use url::Url;
use uuid::Uuid;

const DEFAULT_REMOTE_URL: &str = "http://127.0.0.1:7379";

#[derive(Parser)]
#[command(name = "sty")]
#[command(about = "Hosted and CLI layer for PIG projects")]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Login {
        #[arg(long)]
        dev: bool,
        #[arg(long)]
        token: Option<String>,
        #[arg(long, default_value_t = 7390)]
        callback_port: u16,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
        #[arg(long, default_value = "dev")]
        user: String,
        #[arg(long, default_value = "pig")]
        pig: String,
        #[arg(long)]
        data: Option<PathBuf>,
    },
    Init {
        target: String,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
        #[arg(long, default_value = "pig")]
        pig: String,
    },
    Whoami,
    Project {
        #[command(subcommand)]
        command: ProjectCommands,
    },
}

#[derive(Subcommand)]
enum ProjectCommands {
    Create {
        target: String,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    List {
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
}

pub fn run() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Login {
            dev,
            token,
            callback_port,
            remote_url,
            user,
            pig,
            data,
        } => login(dev, token, callback_port, remote_url, user, pig, data),
        Commands::Init {
            target,
            remote_url,
            pig,
        } => init(target, remote_url, pig),
        Commands::Whoami => whoami(),
        Commands::Project { command } => match command {
            ProjectCommands::Create { target, remote_url } => create_project(&target, &remote_url),
            ProjectCommands::List { remote_url } => list_projects(&remote_url),
        },
    }
}

fn login(
    dev: bool,
    token: Option<String>,
    callback_port: u16,
    remote_url: String,
    user: String,
    pig: String,
    data: Option<PathBuf>,
) -> Result<()> {
    let (token, user) = match (dev, token) {
        (true, None) => {
            let _ = data;
            (create_dev_token(&remote_url, &user)?, user)
        }
        (false, Some(token)) => (token, user),
        (false, None) => {
            let client_id =
                env::var("STY_AVE_CLIENT_ID").unwrap_or_else(|_| DEFAULT_AVE_CLIENT_ID.to_string());
            browser_login(&remote_url, &client_id, callback_port)?
        }
        (true, Some(_)) => bail!("use either --dev or --token, not both"),
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
    let response = Client::new()
        .post("https://api.aveid.net/api/oauth/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("code", code),
            ("code_verifier", verifier),
        ])
        .send()?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        bail!("Ave token exchange failed with status {status}: {body}");
    }
    Ok(response.json()?)
}

fn exchange_sty_token(remote_url: &str, id_token: &str) -> Result<String> {
    let url = format!("{}/v1/session/exchange", remote_url.trim_end_matches('/'));
    let response = Client::new()
        .post(url)
        .json(&serde_json::json!({ "id_token": id_token }))
        .send()?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        bail!("sty session exchange failed with status {status}: {body}");
    }
    Ok(response.json::<TokenResponse>()?.token)
}

fn auth_user(remote_url: &str, token: &str) -> Result<String> {
    let url = format!("{}/v1/auth/check", remote_url.trim_end_matches('/'));
    let response = Client::new().post(url).bearer_auth(token).send()?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        bail!("auth check failed with status {status}: {body}");
    }
    Ok(response.json::<AuthCheckResponse>()?.user)
}

fn pkce_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn create_dev_token(remote_url: &str, user: &str) -> Result<String> {
    let url = format!("{}/v1/dev/tokens", remote_url.trim_end_matches('/'));
    let response = Client::new()
        .post(url)
        .json(&serde_json::json!({ "user": user }))
        .send()?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        bail!("dev token request failed with status {status}: {body}");
    }
    Ok(response.json::<TokenResponse>()?.token)
}

fn init(target: String, remote_url: String, pig: String) -> Result<()> {
    validate_target(&target)?;
    create_project(&target, &remote_url)?;
    let status = Command::new(&pig)
        .args(["remote", "add", &target, "--remote-url", &remote_url])
        .status()
        .with_context(|| format!("failed to run `{pig} remote add`"))?;
    if !status.success() {
        bail!("`{pig} remote add` failed");
    }
    println!("Connected this repo to {target}");
    Ok(())
}

fn create_project(target: &str, remote_url: &str) -> Result<()> {
    let (tenant, project) = validate_target(target)?;
    let config = load_config()?;
    let url = format!(
        "{}/v1/tenants/{}/projects/{}",
        remote_url.trim_end_matches('/'),
        tenant,
        project
    );
    let response = Client::new()
        .post(url)
        .bearer_auth(config.token)
        .json(&serde_json::json!({}))
        .send()?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        bail!("project create failed with status {status}: {body}");
    }
    println!("Project ready: {target}");
    Ok(())
}

fn list_projects(remote_url: &str) -> Result<()> {
    let config = load_config()?;
    let url = format!("{}/v1/projects", remote_url.trim_end_matches('/'));
    let response = Client::new().get(url).bearer_auth(config.token).send()?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        bail!("project list failed with status {status}: {body}");
    }
    let body = response.json::<ProjectsResponse>()?;
    if body.projects.is_empty() {
        println!("No projects");
        return Ok(());
    }
    for project in body.projects {
        println!(
            "{}/{}\towner {}",
            project.tenant, project.project, project.owner
        );
    }
    Ok(())
}

fn whoami() -> Result<()> {
    let config = load_config()?;
    let url = format!("{}/v1/auth/check", config.remote_url.trim_end_matches('/'));
    let response = Client::new().post(url).bearer_auth(&config.token).send()?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        bail!("auth check failed with status {status}: {body}");
    }
    let body = response.json::<AuthCheckResponse>()?;
    println!("{} on {}", body.user, config.remote_url);
    Ok(())
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

fn load_config() -> Result<StyConfig> {
    let path = config_path()?;
    let bytes = std::fs::read(&path)
        .with_context(|| format!("run `sty login --dev` first; missing {}", path.display()))?;
    Ok(serde_json::from_slice(&bytes)?)
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
