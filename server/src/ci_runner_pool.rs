use serde_json::json;
use worker::{
    DurableObject, Env, Method, Request, Response, Result, State, Url, WebSocket,
    WebSocketIncomingMessage, WebSocketPair, durable_object,
};

pub(crate) const CI_RUNNER_POOL_BINDING: &str = "STY_CI_RUNNER_POOL";

#[durable_object(websocket)]
pub struct CiRunnerPool {
    state: State,
}

impl DurableObject for CiRunnerPool {
    fn new(state: State, _env: Env) -> Self {
        Self { state }
    }

    async fn fetch(&self, req: Request) -> Result<Response> {
        let url = req.url()?;
        match (req.method(), url.path()) {
            (Method::Get, "/connect") => self.connect(url).await,
            (Method::Get, "/notify") | (Method::Post, "/notify") => self.notify(url).await,
            _ => Response::error("not found", 404),
        }
    }

    async fn websocket_message(
        &self,
        ws: WebSocket,
        message: WebSocketIncomingMessage,
    ) -> Result<()> {
        if matches!(message, WebSocketIncomingMessage::String(value) if value == "ping") {
            ws.send(&json!({ "type": "pong" }))?;
        }
        Ok(())
    }

    async fn websocket_close(
        &self,
        _ws: WebSocket,
        _code: usize,
        _reason: String,
        _was_clean: bool,
    ) -> Result<()> {
        Ok(())
    }

    async fn websocket_error(&self, _ws: WebSocket, _error: worker::Error) -> Result<()> {
        Ok(())
    }
}

impl CiRunnerPool {
    async fn connect(&self, url: Url) -> Result<Response> {
        let runner = query(&url, "runner").unwrap_or_else(|| "runner".to_string());
        let pair = WebSocketPair::new()?;
        self.state
            .accept_websocket_with_tags(&pair.server, &[runner.as_str()]);
        Response::from_websocket(pair.client)
    }

    async fn notify(&self, url: Url) -> Result<Response> {
        let jobs = query(&url, "jobs")
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(1);
        let payload = json!({ "type": "job_available", "jobs": jobs.max(1) });
        for socket in self.state.get_websockets() {
            let _ = socket.send(&payload);
        }
        Response::from_json(&json!({ "ok": true }))
    }
}

pub(crate) async fn connect_runner(
    ctx: &crate::request_context::AppRouteContext,
    runner: &crate::d1::CiRunner,
) -> Result<Response> {
    let namespace = ctx.data.durable_object(CI_RUNNER_POOL_BINDING)?;
    let stub = namespace.get_by_name(&runner_pool_name(&runner.tenant, &runner.project))?;
    stub.fetch_with_str(&format!(
        "https://sty.internal/connect?runner={}",
        runner.id
    ))
    .await
}

pub(crate) async fn notify_runners(
    env: &Env,
    tenant: &str,
    project: &str,
    jobs: usize,
) -> Result<()> {
    if jobs == 0 {
        return Ok(());
    }
    let Ok(namespace) = env.durable_object(CI_RUNNER_POOL_BINDING) else {
        return Ok(());
    };
    let stub = namespace.get_by_name(&runner_pool_name(tenant, project))?;
    stub.fetch_with_str(&format!("https://sty.internal/notify?jobs={jobs}"))
        .await?;
    Ok(())
}

fn runner_pool_name(tenant: &str, project: &str) -> String {
    format!("{tenant}/{project}")
}

fn query(url: &Url, name: &str) -> Option<String> {
    url.query_pairs()
        .find_map(|(key, value)| (key == name).then(|| value.to_string()))
        .filter(|value| !value.trim().is_empty())
}
