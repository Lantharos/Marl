use std::path::PathBuf;

use anyhow::{Result, bail};
use clap::Subcommand;
use reqwest::blocking::Client;
use sty_protocol::{Leaf, LeafRequest, Paginated, validate_segment, validate_target};

use crate::auth_commands::{DEFAULT_REMOTE_URL, load_config};
use crate::http::{RequestBuilderExt, response_error};
use crate::interactive;

mod input;

use input::{
    resolve_body, resolve_title, resolve_visibility, split_tags, validate_visibility,
    with_attachment,
};

#[derive(Subcommand)]
pub(crate) enum LeafCommands {
    List {
        target: String,
        #[arg(long)]
        tenant: bool,
        #[arg(long)]
        q: Option<String>,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Get {
        target: String,
        slug: String,
        #[arg(long)]
        tenant: bool,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    #[command(alias = "create")]
    New {
        target: String,
        #[arg(long)]
        tenant: bool,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        slug: Option<String>,
        #[arg(long)]
        body: Option<String>,
        #[arg(long, value_name = "PATH")]
        body_file: Option<PathBuf>,
        #[arg(long)]
        visibility: Option<String>,
        #[arg(long, value_name = "TYPE[:REFERENCE]")]
        attach: Option<String>,
        #[arg(long = "tag")]
        tags: Vec<String>,
        #[arg(long)]
        pinned: bool,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Edit {
        target: String,
        slug: String,
        #[arg(long)]
        tenant: bool,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        new_slug: Option<String>,
        #[arg(long)]
        body: Option<String>,
        #[arg(long, value_name = "PATH")]
        body_file: Option<PathBuf>,
        #[arg(long)]
        visibility: Option<String>,
        #[arg(long, value_name = "TYPE[:REFERENCE]")]
        attach: Option<String>,
        #[arg(long = "tag")]
        tags: Vec<String>,
        #[arg(long)]
        pinned: Option<bool>,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
    Delete {
        target: String,
        slug: String,
        #[arg(long)]
        tenant: bool,
        #[arg(long)]
        yes: bool,
        #[arg(long, default_value = DEFAULT_REMOTE_URL)]
        remote_url: String,
    },
}

enum LeafScope {
    Tenant { tenant: String },
    Project { tenant: String, project: String },
}

impl LeafScope {
    fn parse(target: &str, tenant_scope: bool) -> Result<Self> {
        if tenant_scope {
            validate_segment(target)?;
            return Ok(Self::Tenant {
                tenant: target.to_string(),
            });
        }
        let (tenant, project) = validate_target(target)?;
        Ok(Self::Project {
            tenant: tenant.to_string(),
            project: project.to_string(),
        })
    }

    fn base_url(&self, remote_url: &str) -> String {
        match self {
            Self::Tenant { tenant } => {
                format!(
                    "{}/v1/tenants/{tenant}/leaves",
                    remote_url.trim_end_matches('/')
                )
            }
            Self::Project { tenant, project } => format!(
                "{}/v1/tenants/{tenant}/projects/{project}/leaves",
                remote_url.trim_end_matches('/')
            ),
        }
    }

    fn default_attachment(&self) -> &'static str {
        match self {
            Self::Tenant { .. } => "tenant",
            Self::Project { .. } => "project",
        }
    }
}

pub(crate) fn run(command: LeafCommands) -> Result<()> {
    match command {
        LeafCommands::List {
            target,
            tenant,
            q,
            remote_url,
        } => list(target, tenant, q, remote_url),
        LeafCommands::Get {
            target,
            slug,
            tenant,
            remote_url,
        } => get(target, slug, tenant, remote_url),
        LeafCommands::New {
            target,
            tenant,
            title,
            slug,
            body,
            body_file,
            visibility,
            attach,
            tags,
            pinned,
            remote_url,
        } => create(
            target, tenant, title, slug, body, body_file, visibility, attach, tags, pinned,
            remote_url,
        ),
        LeafCommands::Edit {
            target,
            slug,
            tenant,
            title,
            new_slug,
            body,
            body_file,
            visibility,
            attach,
            tags,
            pinned,
            remote_url,
        } => edit(
            target, slug, tenant, title, new_slug, body, body_file, visibility, attach, tags,
            pinned, remote_url,
        ),
        LeafCommands::Delete {
            target,
            slug,
            tenant,
            yes,
            remote_url,
        } => delete(target, slug, tenant, yes, remote_url),
    }
}

fn list(target: String, tenant_scope: bool, q: Option<String>, remote_url: String) -> Result<()> {
    let scope = LeafScope::parse(&target, tenant_scope)?;
    let config = load_config()?;
    let mut url = scope.base_url(&remote_url);
    if let Some(query) = q
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let encoded = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("q", query)
            .finish();
        url.push('?');
        url.push_str(&encoded);
    }
    let response = Client::new()
        .get(url)
        .bearer_auth(config.token)
        .send_request("Fetching leaves")?;
    if !response.status().is_success() {
        bail!("leaf list failed with status {}", response_error(response));
    }
    let body = response.json::<Paginated<Leaf>>()?;
    if body.items.is_empty() {
        println!("No leaves");
        return Ok(());
    }
    for leaf in body.items {
        println!("{}", leaf_line(&leaf));
    }
    Ok(())
}

fn get(target: String, slug: String, tenant_scope: bool, remote_url: String) -> Result<()> {
    validate_segment(&slug)?;
    let scope = LeafScope::parse(&target, tenant_scope)?;
    let config = load_config()?;
    let response = Client::new()
        .get(format!("{}/{}", scope.base_url(&remote_url), slug))
        .bearer_auth(config.token)
        .send_request("Fetching leaf")?;
    if !response.status().is_success() {
        bail!("leaf fetch failed with status {}", response_error(response));
    }
    let leaf = response.json::<Leaf>()?;
    println!("# {}", leaf.title);
    println!();
    println!("{}", leaf.body);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn create(
    target: String,
    tenant_scope: bool,
    title: Option<String>,
    slug: Option<String>,
    body: Option<String>,
    body_file: Option<PathBuf>,
    visibility: Option<String>,
    attach: Option<String>,
    tags: Vec<String>,
    pinned: bool,
    remote_url: String,
) -> Result<()> {
    let scope = LeafScope::parse(&target, tenant_scope)?;
    let request = LeafRequest {
        slug: slug.filter(|value| !value.trim().is_empty()),
        title: Some(resolve_title(title)?),
        body: Some(resolve_body(body, body_file)?.unwrap_or_default()),
        visibility: Some(resolve_visibility(visibility)?),
        attached_type: None,
        attached_id: None,
        tags: Some(split_tags(tags)),
        pinned: Some(pinned),
    };
    let request = with_attachment(request, scope.default_attachment(), attach)?;
    let leaf = send_leaf_request(&scope, &remote_url, None, "Creating leaf", request, "POST")?;
    println!("Created leaf: {}", leaf.href);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn edit(
    target: String,
    slug: String,
    tenant_scope: bool,
    title: Option<String>,
    new_slug: Option<String>,
    body: Option<String>,
    body_file: Option<PathBuf>,
    visibility: Option<String>,
    attach: Option<String>,
    tags: Vec<String>,
    pinned: Option<bool>,
    remote_url: String,
) -> Result<()> {
    validate_segment(&slug)?;
    let scope = LeafScope::parse(&target, tenant_scope)?;
    let has_changes = title.is_some()
        || new_slug.is_some()
        || body.is_some()
        || body_file.is_some()
        || visibility.is_some()
        || attach.is_some()
        || !tags.is_empty()
        || pinned.is_some();
    if !has_changes {
        bail!("nothing to edit; pass at least one field");
    }
    let mut request = LeafRequest {
        slug: new_slug.filter(|value| !value.trim().is_empty()),
        title: title.filter(|value| !value.trim().is_empty()),
        body: resolve_body(body, body_file)?,
        visibility: visibility.map(validate_visibility).transpose()?,
        attached_type: None,
        attached_id: None,
        tags: (!tags.is_empty()).then(|| split_tags(tags)),
        pinned,
    };
    if attach.is_some() {
        request = with_attachment(request, scope.default_attachment(), attach)?;
    }
    let leaf = send_leaf_request(
        &scope,
        &remote_url,
        Some(&slug),
        "Saving leaf",
        request,
        "PATCH",
    )?;
    println!("Saved leaf: {}", leaf.href);
    Ok(())
}

fn delete(
    target: String,
    slug: String,
    tenant_scope: bool,
    yes: bool,
    remote_url: String,
) -> Result<()> {
    validate_segment(&slug)?;
    let scope = LeafScope::parse(&target, tenant_scope)?;
    if !yes && !interactive::confirm(&format!("Delete leaf `{slug}`?"), false)? {
        println!("Canceled");
        return Ok(());
    }
    let config = load_config()?;
    let response = Client::new()
        .delete(format!("{}/{}", scope.base_url(&remote_url), slug))
        .bearer_auth(config.token)
        .send_request("Deleting leaf")?;
    if !response.status().is_success() {
        bail!(
            "leaf delete failed with status {}",
            response_error(response)
        );
    }
    println!("Deleted leaf: {slug}");
    Ok(())
}

fn send_leaf_request(
    scope: &LeafScope,
    remote_url: &str,
    slug: Option<&str>,
    message: &str,
    request: LeafRequest,
    method: &str,
) -> Result<Leaf> {
    let config = load_config()?;
    let url = match slug {
        Some(slug) => format!("{}/{}", scope.base_url(remote_url), slug),
        None => scope.base_url(remote_url),
    };
    let client = Client::new();
    let builder = match method {
        "POST" => client.post(url),
        "PATCH" => client.patch(url),
        _ => bail!("unsupported leaf method"),
    };
    let response = builder
        .bearer_auth(config.token)
        .json(&request)
        .send_request(message)?;
    if !response.status().is_success() {
        bail!(
            "leaf request failed with status {}",
            response_error(response)
        );
    }
    Ok(response.json()?)
}

fn leaf_line(leaf: &Leaf) -> String {
    let attach = match leaf.attached_id.as_deref() {
        Some(id) => format!("{}:{id}", leaf.attached_type),
        None => leaf.attached_type.clone(),
    };
    format!(
        "{:<24} {:<10} {:<18} {}",
        leaf.slug, leaf.visibility, attach, leaf.title
    )
}
