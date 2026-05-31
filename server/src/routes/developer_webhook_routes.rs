use worker::*;

use crate::features;
use crate::routes::objects::{check_project_capability, require_auth};
use crate::support::{db, json_error, paginate_vec, param, project_params};

pub async fn list_project_webhook_deliveries(
    req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "item_id")?;
    let database = db(&ctx)?;
    check_project_capability(
        &database,
        &tenant,
        &project,
        &user,
        "maintainer",
        "webhooks:read",
    )
    .await?;
    if features::project_webhook_by_id(&database, &tenant, &project, &id)
        .await?
        .is_none()
    {
        return json_error(404, "webhook not found");
    }
    let items =
        features::list_project_webhook_deliveries(&database, &tenant, &project, &id, 100).await?;
    Response::from_json(&paginate_vec(req.url()?, items))
}
