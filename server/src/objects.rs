pub(crate) async fn missing(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
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

pub(crate) async fn upload(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let body: UploadRequest = req.json().await?;
    let store = bucket(&ctx.env)?;
    for object in body.objects {
        validate_object(&object)?;
        if d1::object_kind(&database, &tenant, &project, &object.id).await?.is_some() {
            continue;
        }
        let bytes = decode_base64(&object.bytes_base64)?;
        let size = bytes.len();
        put_bytes(&store, &object_key(&tenant, &project, &object.id), bytes).await?;
        d1::record_object(&database, &tenant, &project, &object.id, &object.kind, size).await?;
    }
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn upload_chunk(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let id = param(&ctx, "object")?;
    let chunk_index = param(&ctx, "chunk")?
        .parse::<usize>()
        .map_err(|_| Error::RustError("invalid chunk index".to_string()))?;
    let kind = required_header(&req, "x-pig-object-kind")?;
    let chunk_count = required_usize_header(&req, "x-pig-chunk-count")?;
    let total_size = required_usize_header(&req, "x-pig-total-size")?;
    validate_object_metadata(&id, &kind)?;
    if chunk_count == 0 || chunk_index >= chunk_count || total_size == 0 {
        return json_error(400, "invalid chunk metadata");
    }
    let store = bucket(&ctx.env)?;
    if d1::object_kind(&database, &tenant, &project, &id).await?.is_some() {
        return Response::from_json(&OkResponse { ok: true });
    }
    let bytes = req.bytes().await?;
    put_bytes(&store, &object_chunk_key(&tenant, &project, &id, chunk_index), bytes).await?;
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn complete_chunked_upload(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let id = param(&ctx, "object")?;
    let body: ChunkCompleteRequest = req.json().await?;
    validate_object_metadata(&id, &body.kind)?;
    if body.chunk_count == 0 {
        return json_error(400, "chunk_count must be greater than zero");
    }
    let store = bucket(&ctx.env)?;
    let key = object_key(&tenant, &project, &id);
    if d1::object_kind(&database, &tenant, &project, &id).await?.is_some() {
        return Response::from_json(&OkResponse { ok: true });
    }
    let mut bytes = Vec::with_capacity(body.total_size);
    for chunk_index in 0..body.chunk_count {
        let chunk_key = object_chunk_key(&tenant, &project, &id, chunk_index);
        let Some(object) = store.get(chunk_key).execute().await? else {
            return json_error(400, &format!("missing chunk {chunk_index} for object {id}"));
        };
        let Some(chunk_body) = object.body() else {
            return json_error(400, &format!("missing chunk body {chunk_index} for object {id}"));
        };
        bytes.extend(chunk_body.bytes().await?);
    }
    if bytes.len() != body.total_size {
        return json_error(400, "chunked object size does not match declared total size");
    }
    let digest = hex::encode(Sha256::digest(&bytes));
    if digest != id {
        return json_error(400, "object id does not match SHA-256 digest");
    }
    put_bytes(&store, &key, bytes).await?;
    d1::record_object(&database, &tenant, &project, &id, &body.kind, body.total_size).await?;
    for chunk_index in 0..body.chunk_count {
        store.delete(object_chunk_key(&tenant, &project, &id, chunk_index)).await?;
    }
    Response::from_json(&OkResponse { ok: true })
}

pub(crate) async fn download(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user: user.clone() }).await?;
    let body: DownloadRequest = req.json().await?;
    let store = bucket(&ctx.env)?;
    let mut objects = Vec::new();
    for id in body.ids {
        let key = object_key(&tenant, &project, &id);
        let Some(object) = store.get(key.clone()).execute().await? else {
            continue;
        };
        let Some(body) = object.body() else {
            continue;
        };
        let bytes = body.bytes().await?;
        let kind = match d1::object_kind(&database, &tenant, &project, &id).await? {
            Some(kind) => kind,
            None => {
                let Some(kind_object) = store.get(format!("{key}.kind")).execute().await? else {
                    continue;
                };
                let Some(kind_body) = kind_object.body() else {
                    continue;
                };
                let kind = kind_body.text().await?;
                d1::record_object(&database, &tenant, &project, &id, &kind, bytes.len()).await?;
                kind
            }
        };
        objects.push(RemoteObject {
            id,
            kind,
            bytes_base64: BASE64.encode(bytes),
        });
    }
    Response::from_json(&DownloadResponse { objects })
}

pub(crate) async fn get_object(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let user = require_auth(&req, &ctx.env).await?;
    let (tenant, project) = project_params(&ctx)?;
    let id = param(&ctx, "object")?;
    let database = db(&ctx.env)?;
    d1::ensure_project(&database, &tenant, &project, &sty_protocol::TokenPrincipal { user }).await?;
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
    Response::from_json(&RemoteObject {
        id,
        kind,
        bytes_base64: BASE64.encode(bytes),
    })
}

// -- Helpers ----------------------------------------------

pub(crate) async fn require_auth(req: &Request, env: &Env) -> Result<String> {
    let Some(value) = req.headers().get("authorization")? else {
        return Err(Error::RustError("missing bearer token".to_string()));
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Err(Error::RustError("missing bearer token".to_string()));
    };
    let database = db(env)?;
    match d1::principal_for_token(&database, token).await? {
        Some(principal) => Ok(principal.user),
        None => Err(Error::RustError("invalid bearer token".to_string())),
    }
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
    if let Some(u) = user {
        if d1::project_access(&database, tenant, project, u).await? {
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
