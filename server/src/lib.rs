use worker::*;

mod auth;
mod ci_runner_pool;
pub(crate) mod features;
mod release_support;
mod request_context;
mod routes;
mod source_archive;
mod support;
mod webhooks;
mod work_queue;

use request_context::AppContext;
use support::{apply_cors, json_error, preflight_response, response_for_error};

#[event(fetch)]
pub async fn main(req: Request, env: Env, ctx: Context) -> Result<Response> {
    if req.method() == Method::Options {
        return preflight_response(&req, &env);
    }

    let path = req.url()?.path().to_string();
    if !path.starts_with("/api/v1/") && !path.starts_with("/v1/") {
        return json_error(404, "not found");
    }

    let request = req.clone()?;
    let app_context = AppContext::new(&request, &env, ctx)?;
    let response = routes::api_router(app_context.clone())
        .run(req, env.clone())
        .await;

    let mut response = match response {
        Ok(response) => response,
        Err(error) => response_for_error(error)?,
    };
    app_context.apply_bookmark(&mut response)?;
    apply_cors(&request, &env, &mut response)?;
    Ok(response)
}
