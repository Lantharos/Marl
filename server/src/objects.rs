pub(crate) async fn missing(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return project_write_error(&database, &tenant, &project).await;
    }
    let body: MissingRequest = req.json().await?;
    let store = bucket(&ctx.env)?;
    let mut missing = Vec::new();
    for id in body.ids {
        if d1::object_kind(&database, &tenant, &project, &id).await?.is_some() {
            continue;
        }
        let key = object_key(&tenant, &project, &id);
        if store.head(key).await?.is_none() {
            missing.push(id);
        }
    }
    Response::from_json(&MissingResponse { missing })
}

pub(crate) async fn put_object(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "object")?;
    let kind = required_header(&req, "x-pig-object-kind")?;
    let size = required_usize_header(&req, "x-pig-object-size")?;
    let size_limit = object_size_limit(&ctx.env);
    validate_object_metadata(&id, &kind)?;
    if size > size_limit {
        return json_error(413, "object is larger than the configured upload limit");
    }
    let database = db(&ctx.env)?;
    if !d1::project_access(&database, &tenant, &project, &user).await? {
        return project_write_error(&database, &tenant, &project).await;
    }
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
    let store = bucket(&ctx.env)?;
    put_bytes(&store, &object_key(&tenant, &project, &id), bytes).await?;
    d1::record_object(&database, &tenant, &project, &id, &kind, size).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn get_object(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = optional_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "object")?;
    let database = db(&ctx.env)?;
    check_project_access(&ctx.env, &tenant, &project, user.as_deref()).await?;
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

pub(crate) async fn require_auth(req: &Request, env: &Env) -> Result<String> {
    let token = bearer_token_from_request(req)?;
    let database = db(env)?;
    match d1::principal_for_token(&database, &token).await? {
        Some(principal) => Ok(principal.user),
        None => Err(Error::RustError("invalid bearer token".to_string())),
    }
}

pub(crate) async fn require_web_auth(req: &Request, env: &Env) -> Result<String> {
    let token = bearer_token_from_request(req)?;
    let database = db(env)?;
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

pub(crate) async fn optional_auth(req: &Request, env: &Env) -> Result<Option<String>> {
    let Some(value) = req.headers().get("authorization")? else {
        return Ok(None);
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Ok(None);
    };
    let database = db(env)?;
    match d1::principal_for_token(&database, token).await? {
        Some(principal) => Ok(Some(principal.user)),
        None => Err(Error::RustError("invalid bearer token".to_string())),
    }
}

pub(crate) async fn check_project_access(
    env: &Env,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<()> {
    let database = db(env)?;
    if !d1::tenant_exists(&database, tenant).await? {
        return Err(Error::RustError(format!(
            "tenant `{tenant}` does not exist; create it first with `sty tenant new {tenant}`"
        )));
    }
    if !d1::project_exists(&database, tenant, project).await? {
        return Err(Error::RustError(format!(
            "project `{tenant}/{project}` does not exist; create it first with `sty init {tenant}/{project}`"
        )));
    }
    if let Some(u) = user {
        if d1::project_access(&database, tenant, project, u).await?
            || matches!(
                d1::project_visibility(&database, tenant, project).await?,
                Some(v) if v == "public"
            )
        {
            Ok(())
        } else {
            Err(Error::RustError("project access denied".to_string()))
        }
    } else {
        match d1::project_visibility(&database, tenant, project).await? {
            Some(v) if v == "public" => Ok(()),
            _ => Err(Error::RustError("sign in required".to_string())),
        }
    }
}

async fn project_write_error(db: &D1Database, tenant: &str, project: &str) -> Result<Response> {
    if !d1::tenant_exists(db, tenant).await? {
        return json_error(
            404,
            &format!("tenant `{tenant}` does not exist; create it first with `sty tenant new {tenant}`"),
        );
    }
    if !d1::project_exists(db, tenant, project).await? {
        return json_error(
            404,
            &format!("project `{tenant}/{project}` does not exist; create it first with `sty init {tenant}/{project}`"),
        );
    }
    json_error(403, "project access denied")
}
