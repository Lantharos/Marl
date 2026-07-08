use super::*;
pub async fn project_visibility(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct Row {
        settings_json: String,
    }
    let row: Option<Row> = db
        .prepare("SELECT settings_json FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    let visibility = row.map(|r| {
        serde_json::from_str::<ProjectSettings>(&r.settings_json)
            .map(|s| s.visibility)
            .unwrap_or_else(|_| "private".to_string())
    });
    Ok(visibility)
}

pub async fn project_settings(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: Option<&TokenPrincipal>,
) -> Result<ProjectSettings> {
    #[derive(Deserialize)]
    struct Row {
        settings_json: String,
        archived_at: Option<String>,
        archived_by: Option<String>,
    }
    let row: Option<Row> = db
        .prepare(
            "SELECT settings_json, archived_at, archived_by
             FROM projects
             WHERE tenant = ?1 AND project = ?2",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;

    let (settings_json, archived_at, archived_by) = match row {
        Some(r) => (r.settings_json, r.archived_at, r.archived_by),
        None => {
            return Ok(ProjectSettings {
                visibility: "private".to_string(),
                follower_count: 0,
                is_following: false,
                public_releases: false,
                archived_at: None,
                archived_by: None,
                archived_by_profile: None,
                default_workspace: "main".to_string(),
                appearance: ProjectAppearance::default(),
                navbar_items: vec![],
                panels: vec![],
                merge_rules: MergeRules::default(),
                protected_workspaces: vec![],
                path_visibility: vec![],
                components: vec![],
                ci: ProjectCiSettings::default(),
            });
        }
    };

    let mut settings: ProjectSettings =
        serde_json::from_str(&settings_json).map_err(|e| err(e.to_string()))?;
    settings.appearance = normalize_project_appearance(settings.appearance);
    settings.ci = normalize_ci_settings(settings.ci);
    settings.path_visibility = normalize_path_visibility(settings.path_visibility);
    settings.components = normalize_project_components(settings.components);

    settings.follower_count = follower_count(db, tenant, project).await?;
    settings.is_following = is_following(db, tenant, project, principal).await?;
    settings.archived_by_profile = match archived_by.as_deref() {
        Some(user) => user_profile(db, user).await?,
        None => None,
    };
    settings.archived_at = archived_at;
    settings.archived_by = archived_by;

    Ok(settings)
}

pub async fn project_public_releases(db: &Database, tenant: &str, project: &str) -> Result<bool> {
    Ok(project_settings(db, tenant, project, None)
        .await?
        .public_releases)
}

pub async fn project_archive(
    db: &Database,
    tenant: &str,
    project: &str,
) -> Result<Option<(String, String)>> {
    #[derive(Deserialize)]
    struct Row {
        archived_at: Option<String>,
        archived_by: Option<String>,
    }
    let row: Option<Row> = db
        .prepare("SELECT archived_at, archived_by FROM projects WHERE tenant = ?1 AND project = ?2")
        .bind(&[js_str(tenant), js_str(project)])?
        .first(None)
        .await?;
    Ok(row.and_then(|row| row.archived_at.zip(row.archived_by)))
}

pub async fn project_is_archived(db: &Database, tenant: &str, project: &str) -> Result<bool> {
    Ok(project_archive(db, tenant, project).await?.is_some())
}

pub async fn update_project_settings(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
    visibility: &str,
    default_workspace: &str,
    appearance: Option<ProjectAppearance>,
    navbar_items: Option<Vec<NavbarItem>>,
    panels: Option<Vec<PanelItem>>,
    merge_rules: Option<MergeRules>,
    protected_workspaces: Option<Vec<String>>,
    path_visibility: Option<Vec<PathVisibilityRule>>,
    components: Option<Vec<ProjectComponent>>,
    ci: Option<ProjectCiSettings>,
    archived: Option<bool>,
    public_releases: Option<bool>,
) -> Result<ProjectSettings> {
    let mut settings = project_settings(db, tenant, project, Some(principal)).await?;
    settings.visibility = visibility.to_string();
    settings.default_workspace = default_workspace.to_string();
    if let Some(public) = public_releases {
        settings.public_releases = public;
    }
    if let Some(value) = appearance {
        settings.appearance = normalize_project_appearance(value);
    }
    if let Some(items) = navbar_items {
        settings.navbar_items = items;
    }
    if let Some(p) = panels {
        settings.panels = p;
    }
    if let Some(rules) = merge_rules {
        settings.merge_rules = normalize_merge_rules(rules);
    }
    if let Some(workspaces) = protected_workspaces {
        settings.protected_workspaces = normalize_protected_workspaces(workspaces);
    }
    if let Some(rules) = path_visibility {
        settings.path_visibility = normalize_path_visibility(rules);
    }
    if let Some(components) = components {
        settings.components = normalize_project_components(components);
    }
    if let Some(ci) = ci {
        settings.ci = normalize_ci_settings(ci);
    }
    let json = serde_json::to_string(&settings).map_err(|e| err(e.to_string()))?;
    db.prepare("UPDATE projects SET settings_json = ?1 WHERE tenant = ?2 AND project = ?3")
        .bind(&[js_str(&json), js_str(tenant), js_str(project)])?
        .run()
        .await?;
    if let Some(archive) = archived {
        set_project_archived(db, tenant, project, principal, archive).await?;
    }
    project_settings(db, tenant, project, Some(principal)).await
}

#[derive(Debug, Clone)]
pub struct PathVisibilityPolicy {
    rules: Vec<PathVisibilityRule>,
    role: Option<String>,
}

pub async fn path_visibility_policy(
    db: &Database,
    tenant: &str,
    project: &str,
    user: Option<&str>,
) -> Result<PathVisibilityPolicy> {
    let settings = project_settings(db, tenant, project, None).await?;
    let role = match user {
        Some(user) => project_effective_role(db, tenant, project, user).await?,
        None => None,
    };
    Ok(PathVisibilityPolicy {
        rules: settings.path_visibility,
        role,
    })
}

pub fn path_can_read(policy: &PathVisibilityPolicy, path: &str) -> bool {
    match path_visibility_for(policy, path).as_str() {
        "public" => true,
        "team" => policy.role.is_some(),
        "private" | "local" => role_allows(policy.role.as_deref(), ROLE_MAINTAINER),
        _ => false,
    }
}

pub fn path_policy_restricts_objects(policy: &PathVisibilityPolicy) -> bool {
    policy.rules.iter().any(|rule| rule.visibility != "public")
}

pub fn path_policy_can_read_all(policy: &PathVisibilityPolicy) -> bool {
    policy
        .rules
        .iter()
        .all(|rule| path_can_read(policy, &rule.path))
}

pub fn normalize_component_ids(
    settings: &ProjectSettings,
    components: impl IntoIterator<Item = String>,
) -> Vec<String> {
    let mut normalized = Vec::new();
    for component in components {
        let id = normalize_component_id(&component);
        if id.is_empty()
            || normalized.iter().any(|item| item == &id)
            || !settings.components.iter().any(|item| item.id == id)
        {
            continue;
        }
        normalized.push(id);
        if normalized.len() >= 20 {
            break;
        }
    }
    normalized
}

pub fn component_ids_for_paths(settings: &ProjectSettings, paths: &[String]) -> Vec<String> {
    let mut ids = Vec::new();
    for component in &settings.components {
        if component
            .paths
            .iter()
            .any(|rule| paths.iter().any(|path| path_rule_matches(rule, path)))
        {
            ids.push(component.id.clone());
        }
    }
    let mut index = 0;
    while index < ids.len() {
        let id = ids[index].clone();
        for component in &settings.components {
            if component.depends_on.iter().any(|dep| dep == &id) && !ids.contains(&component.id) {
                ids.push(component.id.clone());
            }
        }
        index += 1;
    }
    ids
}

fn path_visibility_for(policy: &PathVisibilityPolicy, path: &str) -> String {
    let path = normalize_visibility_path_text(path);
    policy
        .rules
        .iter()
        .filter(|rule| path_rule_matches(&rule.path, &path))
        .max_by_key(|rule| rule.path.len())
        .map(|rule| rule.visibility.clone())
        .unwrap_or_else(|| "public".to_string())
}

fn normalize_merge_rules(rules: MergeRules) -> MergeRules {
    MergeRules {
        required_approvals: rules.required_approvals.min(6),
        require_passing_checks: rules.require_passing_checks,
        dismiss_stale_approvals: rules.dismiss_stale_approvals,
        block_unresolved_comments: rules.block_unresolved_comments,
    }
}

fn normalize_protected_workspaces(workspaces: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for workspace in workspaces {
        let workspace = workspace.trim();
        if workspace.is_empty() || validate_segment(workspace).is_err() {
            continue;
        }
        if !normalized.iter().any(|item| item == workspace) {
            normalized.push(workspace.to_string());
        }
        if normalized.len() >= 20 {
            break;
        }
    }
    normalized
}

fn normalize_path_visibility(rules: Vec<PathVisibilityRule>) -> Vec<PathVisibilityRule> {
    let mut normalized: Vec<PathVisibilityRule> = Vec::new();
    for rule in rules {
        let Some(path) = normalize_visibility_path(&rule.path) else {
            continue;
        };
        let visibility = match rule.visibility.trim() {
            "public" | "team" | "private" | "local" => rule.visibility.trim().to_string(),
            _ => continue,
        };
        if let Some(existing) = normalized.iter_mut().find(|item| item.path == path) {
            existing.visibility = visibility;
            continue;
        }
        normalized.push(PathVisibilityRule { path, visibility });
        if normalized.len() >= 100 {
            break;
        }
    }
    normalized
}

fn normalize_project_components(components: Vec<ProjectComponent>) -> Vec<ProjectComponent> {
    let mut normalized: Vec<ProjectComponent> = Vec::new();
    for component in components {
        let id = normalize_component_id(&component.id);
        let name = component.name.trim();
        if id.is_empty() || name.is_empty() || normalized.iter().any(|item| item.id == id) {
            continue;
        }
        let paths = normalize_component_paths(component.paths);
        if paths.is_empty() {
            continue;
        }
        let owners = normalize_component_values(component.owners, 20, 80, true);
        let deploy_targets = normalize_component_values(component.deploy_targets, 20, 80, true);
        let issue_labels = normalize_component_values(component.issue_labels, 20, 80, false);
        normalized.push(ProjectComponent {
            id,
            name: name.chars().take(80).collect(),
            paths,
            depends_on: normalize_component_refs(component.depends_on, &normalized),
            owners,
            language: normalize_component_text(component.language, 40),
            framework: normalize_component_text(component.framework, 60),
            build_command: normalize_component_command(component.build_command),
            test_command: normalize_component_command(component.test_command),
            deploy_targets,
            issue_labels,
            release_policy: normalize_component_policy(component.release_policy),
            version_policy: normalize_component_policy(component.version_policy),
            visible: component.visible,
            require_owner_approval: component.require_owner_approval,
            order: component.order.min(10_000),
        });
        if normalized.len() >= 100 {
            break;
        }
    }
    normalized.sort_by_key(|component| (component.order, component.name.to_ascii_lowercase()));
    normalized
}

fn normalize_component_id(value: &str) -> String {
    value
        .trim()
        .chars()
        .take(80)
        .map(|ch| ch.to_ascii_lowercase())
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_' || *ch == '.')
        .collect()
}

fn normalize_component_paths(paths: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for path in paths {
        let Some(path) = normalize_visibility_path(&path) else {
            continue;
        };
        if normalized.iter().any(|item| item == &path) {
            continue;
        }
        normalized.push(path);
        if normalized.len() >= 50 {
            break;
        }
    }
    normalized
}

fn normalize_component_refs(values: Vec<String>, existing: &[ProjectComponent]) -> Vec<String> {
    let mut normalized = Vec::new();
    for value in values {
        let id = normalize_component_id(&value);
        if id.is_empty()
            || !existing.iter().any(|component| component.id == id)
            || normalized.iter().any(|item| item == &id)
        {
            continue;
        }
        normalized.push(id);
        if normalized.len() >= 20 {
            break;
        }
    }
    normalized
}

fn normalize_component_values(
    values: Vec<String>,
    limit: usize,
    max_len: usize,
    strict: bool,
) -> Vec<String> {
    let mut normalized = Vec::new();
    for value in values {
        let value = value.trim().trim_start_matches('@');
        if value.is_empty()
            || value.chars().any(char::is_control)
            || (strict
                && !value
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.'))
        {
            continue;
        }
        let value: String = value.chars().take(max_len).collect();
        if normalized.iter().any(|item| item == &value) {
            continue;
        }
        normalized.push(value);
        if normalized.len() >= limit {
            break;
        }
    }
    normalized
}

fn normalize_component_text(value: Option<String>, max_len: usize) -> Option<String> {
    value
        .map(|value| value.trim().chars().take(max_len).collect::<String>())
        .filter(|value| !value.is_empty() && !value.chars().any(char::is_control))
}

fn normalize_component_command(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().chars().take(1_000).collect::<String>())
        .filter(|value| !value.is_empty() && !value.chars().any(char::is_control))
}

fn normalize_component_policy(value: Option<String>) -> Option<String> {
    value.and_then(|value| match value.trim() {
        "independent" | "locked" | "manual" | "none" => Some(value.trim().to_string()),
        _ => None,
    })
}

fn normalize_visibility_path(path: &str) -> Option<String> {
    let path = normalize_visibility_path_text(path);
    if path.is_empty()
        || path == "."
        || path.split('/').any(|segment| segment == "..")
        || path.chars().any(char::is_control)
    {
        return None;
    }
    Some(path.chars().take(240).collect())
}

fn normalize_visibility_path_text(path: &str) -> String {
    let mut path = path.trim().replace('\\', "/");
    while path.starts_with('/') {
        path.remove(0);
    }
    while path.ends_with('/') {
        path.pop();
    }
    for suffix in ["/**", "/*"] {
        if let Some(value) = path.strip_suffix(suffix) {
            path = value.to_string();
        }
    }
    path
}

fn path_rule_matches(rule_path: &str, path: &str) -> bool {
    path == rule_path
        || path
            .strip_prefix(rule_path)
            .is_some_and(|rest| rest.starts_with('/'))
}

fn normalize_ci_settings(settings: ProjectCiSettings) -> ProjectCiSettings {
    let blocks = normalize_ci_blocks(settings.blocks);
    let block_names: Vec<String> = blocks.iter().map(|block| block.name.clone()).collect();
    let mut commands = Vec::new();
    for command in settings.commands {
        let name = command.name.trim();
        let run = command.run.trim();
        if name.is_empty() || run.is_empty() {
            continue;
        }
        if commands.iter().any(|item: &CiCommand| item.name == name) {
            continue;
        }
        commands.push(CiCommand {
            name: name.chars().take(80).collect(),
            run: run.chars().take(4_000).collect(),
            uses_blocks: normalize_ci_block_refs(command.uses_blocks, &block_names),
            timeout_seconds: command.timeout_seconds.clamp(1, 14_400),
            events: normalize_ci_events(command.events, 20),
            workspaces: normalize_ci_patterns(command.workspaces, 20),
            paths: normalize_ci_patterns(command.paths, 50),
            components: normalize_ci_labels(command.components, 50),
            matrix: normalize_ci_matrix(command.matrix, 8),
            labels: normalize_ci_labels(command.labels, 20),
            env: normalize_ci_env(command.env, 50),
            secrets: normalize_ci_secrets(command.secrets, 50),
            artifacts: normalize_ci_paths(command.artifacts, 20),
            cache: normalize_ci_cache(command.cache, 20),
        });
        if commands.len() >= settings.max_jobs_per_head.clamp(1, 100) as usize {
            break;
        }
    }
    ProjectCiSettings {
        enabled: settings.enabled && !commands.is_empty(),
        commands,
        blocks,
        max_concurrent_jobs: settings.max_concurrent_jobs.clamp(1, 100),
        max_jobs_per_head: settings.max_jobs_per_head.clamp(1, 100),
        max_attempts: settings.max_attempts.clamp(1, 10),
        lease_grace_seconds: settings.lease_grace_seconds.clamp(30, 3_600),
        artifact_retention_days: settings.artifact_retention_days.clamp(1, 365),
        cache_retention_days: settings.cache_retention_days.clamp(1, 365),
    }
}

fn normalize_ci_blocks(blocks: Vec<CiCommandBlock>) -> Vec<CiCommandBlock> {
    let mut normalized = Vec::new();
    for block in blocks {
        let name = normalize_ci_block_name(&block.name);
        let run = block.run.trim();
        if name.is_empty() || run.is_empty() || normalized.iter().any(|item: &CiCommandBlock| item.name == name) {
            continue;
        }
        normalized.push(CiCommandBlock {
            name,
            run: run.chars().take(2_000).collect(),
            env: normalize_ci_env(block.env, 20),
            secrets: normalize_ci_secrets(block.secrets, 20),
            cache: normalize_ci_cache(block.cache, 10),
        });
        if normalized.len() >= 20 {
            break;
        }
    }
    normalized
}

fn normalize_ci_block_refs(blocks: Vec<String>, available: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    for block in blocks {
        let name = normalize_ci_block_name(&block);
        if name.is_empty()
            || !available.iter().any(|item| item == &name)
            || normalized.iter().any(|item| item == &name)
        {
            continue;
        }
        normalized.push(name);
        if normalized.len() >= 10 {
            break;
        }
    }
    normalized
}

fn normalize_ci_block_name(value: &str) -> String {
    value
        .trim()
        .chars()
        .take(60)
        .filter(|ch| !ch.is_control())
        .collect()
}

fn normalize_ci_paths(paths: Vec<String>, limit: usize) -> Vec<String> {
    let mut normalized = Vec::new();
    for path in paths {
        let path = path.trim();
        if path.is_empty()
            || path.starts_with('/')
            || path.contains("..")
            || path.contains('\\')
            || path.chars().any(char::is_control)
        {
            continue;
        }
        if !normalized.iter().any(|item| item == path) {
            normalized.push(path.chars().take(200).collect());
        }
        if normalized.len() >= limit {
            break;
        }
    }
    normalized
}

fn normalize_ci_patterns(patterns: Vec<String>, limit: usize) -> Vec<String> {
    let mut normalized = Vec::new();
    for pattern in patterns {
        let value = pattern.trim().replace('\\', "/");
        if value.is_empty()
            || value.len() > 180
            || value.contains("..")
            || value.chars().any(char::is_control)
        {
            continue;
        }
        if normalized.iter().any(|item| item == &value) {
            continue;
        }
        normalized.push(value);
        if normalized.len() >= limit {
            break;
        }
    }
    normalized
}

fn normalize_ci_labels(labels: Vec<String>, limit: usize) -> Vec<String> {
    let mut normalized = Vec::new();
    for label in labels {
        let label = normalize_ci_label(&label);
        if label.is_empty() || normalized.iter().any(|item| item == &label) {
            continue;
        }
        normalized.push(label);
        if normalized.len() >= limit {
            break;
        }
    }
    normalized
}

fn normalize_ci_events(events: Vec<String>, limit: usize) -> Vec<String> {
    let events = normalize_ci_labels(events, limit);
    if events.is_empty() {
        vec!["workspace.ready".to_string()]
    } else {
        events
    }
}

fn normalize_ci_matrix(
    entries: Vec<sty_protocol::CiMatrixEntry>,
    limit: usize,
) -> Vec<sty_protocol::CiMatrixEntry> {
    let mut normalized = Vec::new();
    for entry in entries {
        let key = normalize_ci_label(&entry.key);
        let values = normalize_ci_patterns(entry.values, 20);
        if key.is_empty()
            || values.is_empty()
            || normalized
                .iter()
                .any(|item: &sty_protocol::CiMatrixEntry| item.key == key)
        {
            continue;
        }
        normalized.push(sty_protocol::CiMatrixEntry { key, values });
        if normalized.len() >= limit {
            break;
        }
    }
    normalized
}

fn normalize_ci_label(value: &str) -> String {
    value
        .trim()
        .chars()
        .take(40)
        .map(|ch| ch.to_ascii_lowercase())
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_' || *ch == '.')
        .collect()
}

fn normalize_ci_env(
    entries: Vec<sty_protocol::CiEnvEntry>,
    limit: usize,
) -> Vec<sty_protocol::CiEnvEntry> {
    let mut normalized = Vec::new();
    for entry in entries {
        let key = normalize_ci_secret_key(&entry.key);
        let value = entry.value.trim();
        if key.is_empty() || value.is_empty() || value.len() > 1_000 {
            continue;
        }
        if normalized
            .iter()
            .any(|item: &sty_protocol::CiEnvEntry| item.key == key)
        {
            continue;
        }
        normalized.push(sty_protocol::CiEnvEntry {
            key,
            value: value.chars().take(1_000).collect(),
        });
        if normalized.len() >= limit {
            break;
        }
    }
    normalized
}

fn normalize_ci_secrets(secrets: Vec<String>, limit: usize) -> Vec<String> {
    let mut normalized = Vec::new();
    for secret in secrets {
        let secret = normalize_ci_secret_key(&secret);
        if secret.is_empty() || normalized.iter().any(|item| item == &secret) {
            continue;
        }
        normalized.push(secret);
        if normalized.len() >= limit {
            break;
        }
    }
    normalized
}

fn normalize_ci_secret_key(value: &str) -> String {
    let value = value.trim();
    if value.len() > 80 {
        return String::new();
    }
    let normalized = value
        .chars()
        .filter(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || *ch == '_')
        .collect::<String>();
    if normalized.len() != value.len()
        || normalized
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_digit())
    {
        return String::new();
    }
    normalized
}

fn normalize_ci_cache(
    entries: Vec<sty_protocol::CiCacheEntry>,
    limit: usize,
) -> Vec<sty_protocol::CiCacheEntry> {
    let mut normalized = Vec::new();
    for entry in entries {
        let key = entry.key.trim();
        if key.is_empty()
            || key.len() > 160
            || key.contains('/')
            || key.contains('\\')
            || key.contains("..")
            || key.chars().any(char::is_control)
        {
            continue;
        }
        let paths = normalize_ci_paths(vec![entry.path], 1);
        let Some(path) = paths.into_iter().next() else {
            continue;
        };
        if !normalized
            .iter()
            .any(|item: &sty_protocol::CiCacheEntry| item.key == key)
        {
            normalized.push(sty_protocol::CiCacheEntry {
                key: key.to_string(),
                path,
            });
        }
        if normalized.len() >= limit {
            break;
        }
    }
    normalized
}

fn normalize_project_appearance(appearance: ProjectAppearance) -> ProjectAppearance {
    let default = ProjectAppearance::default();
    ProjectAppearance {
        accent_color: normalize_hex(&appearance.accent_color, &default.accent_color),
        background_color: normalize_hex(&appearance.background_color, &default.background_color),
        surface_color: normalize_hex(&appearance.surface_color, &default.surface_color),
        foreground_color: normalize_hex(&appearance.foreground_color, &default.foreground_color),
        muted_color: normalize_hex(&appearance.muted_color, &default.muted_color),
        border_color: normalize_hex(&appearance.border_color, &default.border_color),
        nav_background_color: normalize_hex(
            &appearance.nav_background_color,
            &default.nav_background_color,
        ),
        nav_foreground_color: normalize_hex(
            &appearance.nav_foreground_color,
            &default.nav_foreground_color,
        ),
        nav_muted_color: normalize_hex(&appearance.nav_muted_color, &default.nav_muted_color),
        primary_color: normalize_hex(&appearance.primary_color, &default.primary_color),
        primary_foreground_color: normalize_hex(
            &appearance.primary_foreground_color,
            &default.primary_foreground_color,
        ),
        code_background_color: normalize_hex(
            &appearance.code_background_color,
            &default.code_background_color,
        ),
    }
}

fn normalize_hex(value: &str, fallback: &str) -> String {
    let trimmed = value.trim().trim_start_matches('#');
    let expanded = match trimmed.len() {
        3 if trimmed.chars().all(|char| char.is_ascii_hexdigit()) => trimmed
            .chars()
            .flat_map(|char| [char, char])
            .collect::<String>(),
        6 if trimmed.chars().all(|char| char.is_ascii_hexdigit()) => trimmed.to_string(),
        _ => return fallback.to_string(),
    };
    format!("#{}", expanded.to_ascii_lowercase())
}

async fn set_project_archived(
    db: &Database,
    tenant: &str,
    project: &str,
    principal: &TokenPrincipal,
    archived: bool,
) -> Result<()> {
    if archived {
        db.prepare(
            "UPDATE projects
             SET archived_at = COALESCE(archived_at, ?1),
                 archived_by = COALESCE(archived_by, ?2)
             WHERE tenant = ?3 AND project = ?4",
        )
        .bind(&[
            js_str(&now_rfc3339()),
            js_str(&principal.user),
            js_str(tenant),
            js_str(project),
        ])?
        .run()
        .await?;
    } else {
        db.prepare(
            "UPDATE projects
             SET archived_at = NULL,
                 archived_by = NULL
             WHERE tenant = ?1 AND project = ?2",
        )
        .bind(&[js_str(tenant), js_str(project)])?
        .run()
        .await?;
    }
    Ok(())
}
