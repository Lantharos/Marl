use clap::Args;

pub const DEFAULT_REMOTE_URL: &str = "https://sty.sh/api";
pub const LOCAL_API_HOST: &str = "127.0.0.1";

#[derive(Args, Clone, Debug, Default)]
pub struct RemoteOpts {
    #[arg(long, help = "sty API base URL")]
    pub remote_url: Option<String>,
    #[arg(long, help = "Local API port (uses http://127.0.0.1:<port>/api)")]
    pub port: Option<u16>,
}

impl RemoteOpts {
    pub fn resolve(&self) -> String {
        resolve_remote_url(self.remote_url.as_deref(), self.port)
    }
}

pub fn resolve_remote_url(remote_url: Option<&str>, port: Option<u16>) -> String {
    if let Some(url) = remote_url.filter(|value| !value.trim().is_empty()) {
        return normalize_remote_url(url);
    }
    if let Some(port) = port {
        return format!("http://{LOCAL_API_HOST}:{port}/api");
    }
    DEFAULT_REMOTE_URL.to_string()
}

pub fn normalize_remote_url(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}
