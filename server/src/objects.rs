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
    if ids.len() > 512 {
        return json_error(413, "object missing batch is too large");
    }
    let known = d1::object_kinds(&database, &tenant, &project, &ids).await?;
    let missing = ids
        .into_iter()
        .filter(|id| !known.contains_key(id))
        .collect();
    Response::from_json(&MissingResponse { missing })
}

pub(crate) async fn download_objects(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_read_capability(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        "objects:read",
    )
    .await?;
    let path_policy = d1::path_visibility_policy(&database, &tenant, &project, user.as_deref()).await?;
    if d1::path_policy_restricts_objects(&path_policy)
        && !d1::path_policy_can_read_all(&path_policy)
    {
        return json_error(403, "object reads require full source access");
    }
    let body: DownloadRequest = req.json().await?;
    let mut ids = Vec::new();
    for id in body.ids {
        validate_object_id(&id)?;
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    if ids.len() > 128 {
        return json_error(413, "object download batch is too large");
    }
    let kinds = d1::object_kinds(&database, &tenant, &project, &ids).await?;
    let store = bucket(&ctx.env)?;
    let mut objects = Vec::with_capacity(ids.len());
    let mut total_size = 0usize;
    for id in ids {
        let Some(kind) = kinds.get(&id).cloned() else {
            return json_error(404, "object not found");
        };
        let Some(object) = store.get(object_key(&tenant, &project, &id)).execute().await? else {
            return json_error(404, "object not found");
        };
        let Some(body) = object.body() else {
            return json_error(404, "object not found");
        };
        let bytes = body.bytes().await?;
        total_size += bytes.len();
        if total_size > 8 * 1024 * 1024 {
            return json_error(413, "object download batch payload is too large");
        }
        objects.push(RemoteObject {
            id,
            kind,
            bytes_base64: BASE64_STANDARD.encode(bytes),
        });
    }
    Response::from_json(&DownloadResponse { objects })
}

const OBJECT_UPLOAD_BATCH_LIMIT: usize = 64;
const OBJECT_UPLOAD_BATCH_BYTES: usize = 8 * 1024 * 1024;

pub(crate) async fn upload_objects(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = require_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    check_project_write_capability(&database, &tenant, &project, &user, "contributor", "objects:write").await?;
    let body: UploadRequest = req.json().await?;
    if body.objects.len() > OBJECT_UPLOAD_BATCH_LIMIT {
        return json_error(413, "object upload batch is too large");
    }
    let max_object_size = object_size_limit(&ctx.env);
    let batch_size_limit = max_object_size.min(OBJECT_UPLOAD_BATCH_BYTES);
    let mut total_size = 0usize;
    let mut seen = std::collections::BTreeSet::new();
    let mut objects = Vec::with_capacity(body.objects.len());
    for object in body.objects {
        validate_object_metadata(&object.id, &object.kind)?;
        if !seen.insert(object.id.clone()) {
            continue;
        }
        let bytes = BASE64_STANDARD
            .decode(object.bytes_base64)
            .map_err(|error| Error::RustError(error.to_string()))?;
        if bytes.len() > max_object_size {
            return json_error(413, "object is larger than the configured upload limit");
        }
        total_size += bytes.len();
        if total_size > batch_size_limit {
            return json_error(413, "object upload batch payload is too large");
        }
        objects.push((object.id, object.kind, bytes));
    }

    let ids = objects
        .iter()
        .map(|(id, _, _)| id.clone())
        .collect::<Vec<_>>();
    let known = d1::object_kinds(&database, &tenant, &project, &ids).await?;
    let store = bucket(&ctx.env)?;
    let mut stored = 0usize;
    let mut skipped = 0usize;
    for (id, kind, bytes) in objects {
        if let Some(existing_kind) = known.get(&id) {
            if existing_kind != &kind {
                return json_error(409, "object kind does not match existing object");
            }
            skipped += 1;
            continue;
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
        let size = bytes.len();
        put_bytes(&store, &object_key(&tenant, &project, &id), bytes).await?;
        d1::record_object(&database, &tenant, &project, &id, &kind, size).await?;
        stored += 1;
    }
    Response::from_json(&json!({ "ok": true, "stored": stored, "skipped": skipped }))
}

const PATH_CLOSURE_OBJECT_LIMIT: usize = 10_000;

pub(crate) async fn object_path_closure(
    mut req: Request,
    ctx: crate::request_context::AppRouteContext,
) -> Result<Response> {
    let user = optional_auth(&req, &ctx).await?;
    let (tenant, project) = project_params(&ctx)?;
    let database = db(&ctx)?;
    let body: PathClosureRequest = req.json().await?;
    let workspace = body.workspace.unwrap_or_else(|| "main".to_string());
    validate_segment(&workspace).map_err(|error| Error::RustError(error.to_string()))?;
    check_workspace_read_capability(
        &database,
        &tenant,
        &project,
        user.as_deref(),
        &workspace,
    )
    .await?;
    let path_policy = d1::path_visibility_policy(&database, &tenant, &project, user.as_deref()).await?;
    if d1::path_policy_restricts_objects(&path_policy)
        && !d1::path_policy_can_read_all(&path_policy)
    {
        return json_error(403, "path closure requires full source access");
    }

    let workspace_head = d1::head(&database, &tenant, &project, &workspace).await?;
    let Some(workspace_head) = workspace_head else {
        return json_error(404, "workspace has no head");
    };
    let head_id = body.snapshot.unwrap_or_else(|| workspace_head.clone());
    validate_object_id(&head_id)?;
    if head_id != workspace_head
        && !is_ancestor(&ctx.env, &tenant, &project, &head_id, &workspace_head).await?
    {
        return json_error(403, "snapshot is not reachable from workspace");
    }

    let path = normalize_tree_prefix(&body.path)?;
    let store = bucket(&ctx.env)?;
    let snapshot_bytes = r2_bytes(&store, &object_key(&tenant, &project, &head_id)).await?;
    let snapshot: serde_json::Value = serde_json::from_slice(&snapshot_bytes)
        .map_err(|error| Error::RustError(error.to_string()))?;
    let root_tree = snapshot["root_tree"]
        .as_str()
        .ok_or_else(|| Error::RustError("malformed snapshot object".to_string()))?
        .to_string();
    validate_object_id(&root_tree)?;

    let mut closure = ObjectPathClosure::default();
    closure.add_object(head_id.clone(), "snapshot".to_string())?;
    closure.add_object(root_tree.clone(), "tree".to_string())?;
    if !collect_path_closure(&store, &tenant, &project, &root_tree, &path, &mut closure).await? {
        return json_error(404, "path not found");
    }

    let (objects, mut files) = closure.into_parts();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Response::from_json(&PathClosureResponse {
        workspace,
        head: head_id,
        root_tree,
        path,
        objects,
        files,
    })
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
    let path_policy = d1::path_visibility_policy(&database, &tenant, &project, user.as_deref()).await?;
    if d1::path_policy_restricts_objects(&path_policy)
        && !d1::path_policy_can_read_all(&path_policy)
    {
        return json_error(403, "object reads require full source access");
    }
    let public_cache = matches!(
        d1::project_visibility(&database, &tenant, &project).await?,
        Some(visibility) if visibility == "public"
    ) && !d1::path_policy_restricts_objects(&path_policy);
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

#[derive(Default)]
struct ObjectPathClosure {
    objects: std::collections::BTreeMap<String, String>,
    files: Vec<PathClosureFile>,
}

impl ObjectPathClosure {
    fn add_object(&mut self, id: String, kind: String) -> Result<()> {
        validate_object_metadata(&id, &kind)?;
        if let Some(existing_kind) = self.objects.get(&id) {
            if existing_kind != &kind {
                return Err(Error::RustError(
                    "object referenced with conflicting kinds".to_string(),
                ));
            }
            return Ok(());
        }
        if self.objects.len() >= PATH_CLOSURE_OBJECT_LIMIT {
            return Err(Error::RustError("path object closure limit exceeded".to_string()));
        }
        self.objects.insert(id, kind);
        Ok(())
    }

    fn add_file(&mut self, path: String, id: String) -> Result<()> {
        validate_object_metadata(&id, "blob")?;
        self.files.push(PathClosureFile { path, id });
        Ok(())
    }

    fn into_parts(self) -> (Vec<PathClosureObject>, Vec<PathClosureFile>) {
        let objects = self
            .objects
            .into_iter()
            .map(|(id, kind)| PathClosureObject { id, kind })
            .collect();
        (objects, self.files)
    }
}

async fn collect_path_closure(
    store: &Bucket,
    tenant: &str,
    project: &str,
    root_tree: &str,
    path: &str,
    closure: &mut ObjectPathClosure,
) -> Result<bool> {
    if path.is_empty() {
        collect_tree_subtree(store, tenant, project, root_tree, "", closure).await?;
        return Ok(true);
    }

    let mut tree_id = root_tree.to_string();
    let mut prefix = String::new();
    let parts = path.split('/').collect::<Vec<_>>();
    for (index, part) in parts.iter().enumerate() {
        let bytes = r2_bytes(store, &object_key(tenant, project, &tree_id)).await?;
        let entries = parse_tree_entries(&bytes)?;
        let Some(entry) = entries.into_iter().find(|entry| entry.name == *part) else {
            return Ok(false);
        };
        closure.add_object(entry.id.clone(), entry.entry_type.clone())?;
        let current_path = if prefix.is_empty() {
            (*part).to_string()
        } else {
            format!("{prefix}/{part}")
        };
        if index + 1 == parts.len() {
            if entry.entry_type == "blob" {
                closure.add_file(current_path, entry.id)?;
            } else {
                collect_tree_subtree(
                    store,
                    tenant,
                    project,
                    &entry.id,
                    &current_path,
                    closure,
                )
                .await?;
            }
            return Ok(true);
        }
        if entry.entry_type != "tree" {
            return Ok(false);
        }
        tree_id = entry.id;
        prefix = current_path;
    }
    Ok(false)
}

async fn collect_tree_subtree(
    store: &Bucket,
    tenant: &str,
    project: &str,
    start_tree: &str,
    start_prefix: &str,
    closure: &mut ObjectPathClosure,
) -> Result<()> {
    let mut stack = vec![(
        start_prefix.to_string(),
        start_tree.to_string(),
        0usize,
        std::collections::BTreeSet::new(),
    )];
    let mut visited_entries = 0usize;
    while let Some((prefix, tree_id, depth, mut ancestors)) = stack.pop() {
        validate_object_id(&tree_id)?;
        if depth > MAX_TREE_DEPTH {
            return Err(Error::RustError("tree depth limit exceeded".to_string()));
        }
        if !ancestors.insert(tree_id.clone()) {
            return Err(Error::RustError("tree cycle detected".to_string()));
        }
        closure.add_object(tree_id.clone(), "tree".to_string())?;
        let bytes = r2_bytes(store, &object_key(tenant, project, &tree_id)).await?;
        let mut entries = parse_tree_entries(&bytes)?;
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        for entry in entries.into_iter().rev() {
            visited_entries += 1;
            if visited_entries > MAX_TREE_ENTRIES {
                return Err(Error::RustError("tree entry limit exceeded".to_string()));
            }
            let path = if prefix.is_empty() {
                entry.name.clone()
            } else {
                format!("{prefix}/{}", entry.name)
            };
            closure.add_object(entry.id.clone(), entry.entry_type.clone())?;
            match entry.entry_type.as_str() {
                "blob" => closure.add_file(path, entry.id)?,
                "tree" => stack.push((path, entry.id, depth + 1, ancestors.clone())),
                _ => return Err(Error::RustError("unknown tree entry type".to_string())),
            }
        }
    }
    Ok(())
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
    if let Some(user) = user.filter(|value| value.starts_with("ci-runner:")) {
        ensure_project_target(db, tenant, project).await?;
        if d1::ci_runner_allows(db, tenant, project, user, capability)
            .await?
            .unwrap_or(false)
        {
            return Ok(());
        }
        return Err(Error::RustError(format!(
            "ci runner is missing `{capability}` permission"
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
    if user.starts_with("ci-runner:") {
        ensure_project_target(db, tenant, project).await?;
        if d1::ci_runner_allows(db, tenant, project, user, capability)
            .await?
            .unwrap_or(false)
        {
            return Ok(());
        }
        return Err(Error::RustError(format!(
            "ci runner is missing `{capability}` permission"
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
