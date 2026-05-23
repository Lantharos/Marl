pub(crate) async fn missing(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "objects:write").await?;
    let body: MissingRequest = req.json().await?;
    let mut ids = Vec::new();
    for id in body.ids {
        validate_object_id(&id)?;
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    let known = d1::object_kinds(&database, &tenant, &project, &ids).await?;
    let missing = ids
        .into_iter()
        .filter(|id| !known.contains_key(id))
        .collect();
    Response::from_json(&MissingResponse { missing })
}

pub(crate) async fn put_object(mut req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "object")?;
    let kind = required_header(&req, "x-pig-object-kind")?;
    let size = required_usize_header(&req, "x-pig-object-size")?;
    let size_limit = object_size_limit(&ctx.env);
    validate_object_metadata(&id, &kind)?;
    if size > size_limit {
        return json_error(413, "object is larger than the configured upload limit");
    }
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "objects:write").await?;
    if d1::object_kind(&database, &tenant, &project, &id).await?.is_some() {
        return Response::from_json(&OkResponse { ok: true });
    }
    let bytes = req.bytes().await?;
    if bytes.len() != size {
        return json_error(400, "object size does not match x-pig-object-size");
    }
    let digest = object_digest_for_kind(&bytes, &kind)?;
    if digest != id {
        return json_error(400, "object id does not match SHA-256 digest");
    }
    validate_object_payload(&kind, &bytes)?;
    if kind == "snapshot" {
        if let Err(reason) = validate_snapshot_signature(&database, &bytes).await {
            return json_error(400, &format!("invalid snapshot signature: {reason}"));
        }
    }
    let store = bucket(&ctx.env)?;
    put_bytes(&store, &object_key(&tenant, &project, &id), bytes).await?;
    d1::record_object(&database, &tenant, &project, &id, &kind, size).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn get_object(req: Request, ctx: crate::request_context::AppRouteContext) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "object")?;
    validate_object_id(&id)?;
    let database = db(&ctx)?;
    check_project_read_capability(&database, &tenant, &project, user.as_deref(), "objects:read").await?;
    let public_cache = matches!(
        d1::project_visibility(&database, &tenant, &project).await?,
        Some(visibility) if visibility == "public"
    );
    if let Some(response) = not_modified_response(&req, &id, public_cache, 31_536_000, true)? {
        return Ok(response);
    }
    let store = bucket(&ctx.env)?;
    let Some(object) = store.get(object_key(&tenant, &project, &id)).execute().await? else {
        return json_error(404, "object not found");
    };
    let Some(body) = object.body() else {
        return json_error(404, "object not found");
    };
    let bytes = body.bytes().await?;
    let kind = d1::object_kind(&database, &tenant, &project, &id)
        .await?
        .unwrap_or_else(|| "blob".to_string());
    let size = bytes.len();
    let mut response = Response::from_bytes(bytes)?;
    let headers = response.headers_mut();
    headers.set("content-type", "application/octet-stream")?;
    headers.set("x-pig-object-kind", &kind)?;
    headers.set("x-pig-object-size", &size.to_string())?;
    apply_cache_headers(headers, &id, public_cache, 31_536_000, true)?;
    Ok(response)
}

// -- Helpers ----------------------------------------------

#[derive(serde::Deserialize, serde::Serialize)]
struct CanonicalSnapshot {
    id: String,
    parents: Vec<String>,
    #[serde(default = "default_snapshot_kind")]
    kind: String,
    author: String,
    agent: Option<String>,
    #[serde(default)]
    agent_model: Option<String>,
    time: String,
    message: Option<String>,
    root_tree: String,
    workspace_id: String,
    intents: Vec<CanonicalIntent>,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct CanonicalIntent {
    intent_type: String,
    unit: String,
    name: String,
    file: String,
    #[serde(default)]
    line_start: Option<usize>,
    #[serde(default)]
    line_end: Option<usize>,
}

fn object_digest_for_kind(bytes: &[u8], kind: &str) -> Result<String> {
    if kind != "snapshot" {
        return Ok(hex::encode(Sha256::digest(bytes)));
    }
    let mut snapshot: CanonicalSnapshot =
        serde_json::from_slice(bytes).map_err(|error| Error::RustError(error.to_string()))?;
    snapshot.id.clear();
    let canonical = serde_json::to_vec(&snapshot).map_err(|error| Error::RustError(error.to_string()))?;
    Ok(hex::encode(Sha256::digest(canonical)))
}

fn default_snapshot_kind() -> String {
    "save".to_string()
}

pub(crate) async fn require_auth(
    req: &Request,
    ctx: &crate::request_context::AppRouteContext,
) -> Result<String> {
    let token = bearer_token_from_request(req)?;
    let database = db(ctx)?;
    match d1::principal_for_token(&database, &token).await? {
        Some(principal) => Ok(principal.user),
        None => Err(Error::RustError("invalid bearer token".to_string())),
    }
}

pub(crate) async fn require_web_auth(
    req: &Request,
    ctx: &crate::request_context::AppRouteContext,
) -> Result<String> {
    let token = bearer_token_from_request(req)?;
    let database = db(ctx)?;
    let principal = d1::principal_for_token(&database, &token)
        .await?
        .ok_or_else(|| Error::RustError("invalid bearer token".to_string()))?;
    match d1::token_kind(&database, &token).await?.as_deref() {
        Some("web") => Ok(principal.user),
        _ => Err(Error::RustError("browser approval required".to_string())),
    }
}

fn bearer_token_from_request(req: &Request) -> Result<String> {
    let Some(value) = req.headers().get("authorization")? else {
        return Err(Error::RustError("missing bearer token".to_string()));
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Err(Error::RustError("missing bearer token".to_string()));
    };
    Ok(token.to_string())
}

pub(crate) async fn optional_auth(
    req: &Request,
    ctx: &crate::request_context::AppRouteContext,
) -> Result<Option<String>> {
    let Some(value) = req.headers().get("authorization")? else {
        return Ok(None);
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Ok(None);
    };
    let database = db(ctx)?;
    match d1::principal_for_token(&database, token).await? {
        Some(principal) => Ok(Some(principal.user)),
        None => Err(Error::RustError("invalid bearer token".to_string())),
    }
}

pub(crate) async fn check_project_access(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<()> {
    if !d1::tenant_exists(db, tenant).await? {
        return Err(Error::RustError(format!(
            "tenant `{tenant}` does not exist; create it first with `sty tenant new {tenant}`"
        )));
    }
    if !d1::project_exists(db, tenant, project).await? {
        return Err(Error::RustError(format!(
            "project `{tenant}/{project}` does not exist; create it first with `sty init {tenant}/{project}`"
        )));
    }
    if let Some(u) = user {
        if d1::project_access(db, tenant, project, u).await?
            || matches!(
                d1::project_visibility(db, tenant, project).await?,
                Some(v) if v == "public"
            )
        {
            Ok(())
        } else {
            Err(Error::RustError("project access denied".to_string()))
        }
    } else {
        match d1::project_visibility(db, tenant, project).await? {
            Some(v) if v == "public" => Ok(()),
            _ => Err(Error::RustError("sign in required".to_string())),
        }
    }
}

pub(crate) async fn check_project_role(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: &str,
    minimum: &str,
) -> Result<()> {
    if !d1::tenant_exists(db, tenant).await? {
        return Err(Error::RustError(format!(
            "tenant `{tenant}` does not exist; create it first with `sty tenant new {tenant}`"
        )));
    }
    if !d1::project_exists(db, tenant, project).await? {
        return Err(Error::RustError(format!(
            "project `{tenant}/{project}` does not exist; create it first with `sty init {tenant}/{project}`"
        )));
    }
    if d1::project_role_allows(db, tenant, project, user, minimum).await? {
        return Ok(());
    }
    Err(Error::RustError(format!(
        "project {minimum} access denied"
    )))
}

pub(crate) async fn check_project_read_capability(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
    capability: &str,
) -> Result<()> {
    if let Some(user) = user.filter(|value| value.starts_with("api-key:")) {
        ensure_project_target(db, tenant, project).await?;
        if d1::project_api_key_allows(db, tenant, project, user, capability)
            .await?
            .unwrap_or(false)
        {
            return Ok(());
        }
        return Err(Error::RustError(format!(
            "api key is missing `{capability}` permission"
        )));
    }
    check_project_access(db, tenant, project, user).await
}

pub(crate) async fn check_project_capability(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: &str,
    minimum: &str,
    capability: &str,
) -> Result<()> {
    if user.starts_with("api-key:") {
        ensure_project_target(db, tenant, project).await?;
        if d1::project_api_key_allows(db, tenant, project, user, capability)
            .await?
            .unwrap_or(false)
        {
            return Ok(());
        }
        return Err(Error::RustError(format!(
            "api key is missing `{capability}` permission"
        )));
    }
    check_project_role(db, tenant, project, user, minimum).await
}

async fn ensure_project_target(db: &crate::request_context::Database, tenant: &str, project: &str) -> Result<()> {
    if !d1::tenant_exists(db, tenant).await? {
        return Err(Error::RustError(format!(
            "tenant `{tenant}` does not exist; create it first with `sty tenant new {tenant}`"
        )));
    }
    if !d1::project_exists(db, tenant, project).await? {
        return Err(Error::RustError(format!(
            "project `{tenant}/{project}` does not exist; create it first with `sty init {tenant}/{project}`"
        )));
    }
    Ok(())
}

pub(crate) async fn check_project_write_role(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: &str,
    minimum: &str,
) -> Result<()> {
    check_project_role(db, tenant, project, user, minimum).await?;
    if d1::project_is_archived(db, tenant, project).await? {
        return Err(Error::RustError(
            "project is archived and read-only".to_string(),
        ));
    }
    Ok(())
}

pub(crate) async fn check_project_write_capability(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: &str,
    minimum: &str,
    capability: &str,
) -> Result<()> {
    check_project_capability(db, tenant, project, user, minimum, capability).await?;
    if d1::project_is_archived(db, tenant, project).await? {
        return Err(Error::RustError(
            "project is archived and read-only".to_string(),
        ));
    }
    Ok(())
}

pub(crate) async fn check_workspace_read_capability(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
    workspace: &str,
) -> Result<()> {
    let capability = if workspace == "main" {
        "main:read"
    } else {
        "workspaces:read"
    };
    check_project_read_capability(db, tenant, project, user, capability).await?;
    if d1::workspace_can_read(db, tenant, project, user, workspace).await? {
        return Ok(());
    }
    Err(Error::RustError("workspace access denied".to_string()))
}

pub(crate) async fn check_workspace_write_capability(
    db: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    user: &str,
    workspace: &str,
) -> Result<()> {
    let exists = d1::workspace_exists(db, tenant, project, workspace).await?;
    let capability = if workspace == "main" {
        "main:write"
    } else if exists {
        "workspaces:write"
    } else {
        "workspaces:create"
    };
    check_project_write_capability(db, tenant, project, user, "contributor", capability).await?;
    if !exists || d1::workspace_can_write(db, tenant, project, user, workspace).await? {
        return Ok(());
    }
    Err(Error::RustError("workspace access denied".to_string()))
}
