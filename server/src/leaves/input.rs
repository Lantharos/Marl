use sty_protocol::{Leaf, LeafRequest, validate_segment};
use worker::*;

use crate::support::{query_text, value_matches_query};
use crate::{d1, request_context::Database};

pub(crate) async fn leaf_input(
    database: &Database,
    tenant: &str,
    project: Option<&str>,
    request: LeafRequest,
    existing: Option<&Leaf>,
) -> Result<d1::LeafInput> {
    let title = normalize_required(request.title.as_deref(), "title")?;
    let body = request.body.unwrap_or_default();
    let visibility = normalize_visibility(request.visibility.as_deref())?;
    let attached_type =
        normalize_attached_type(request.attached_type.as_deref(), project.is_some())?;
    let attached_id = normalize_attached_id(
        request
            .attached_id
            .as_ref()
            .and_then(|value| value.as_deref()),
    )?;
    let tags = normalize_tags(request.tags.unwrap_or_default())?;
    let slug = unique_slug(
        database,
        tenant,
        project,
        request.slug.as_deref().unwrap_or(&title),
        existing.map(|leaf| leaf.id.as_str()),
    )
    .await?;
    Ok(d1::LeafInput {
        slug,
        title,
        body,
        visibility,
        attached_type,
        attached_id,
        tags,
        pinned: request.pinned.unwrap_or(false),
    })
}

pub(crate) async fn leaf_patch(
    database: &Database,
    tenant: &str,
    project: Option<&str>,
    request: LeafRequest,
    existing: &Leaf,
) -> Result<d1::LeafPatch> {
    let slug = match request.slug {
        Some(value) => {
            Some(unique_slug(database, tenant, project, &value, Some(&existing.id)).await?)
        }
        None => None,
    };
    let title = request
        .title
        .map(|value| normalize_required(Some(&value), "title"))
        .transpose()?;
    Ok(d1::LeafPatch {
        slug,
        title,
        body: request.body,
        visibility: request
            .visibility
            .as_deref()
            .map(|value| normalize_visibility(Some(value)))
            .transpose()?,
        attached_type: request
            .attached_type
            .as_deref()
            .map(|value| normalize_attached_type(Some(value), project.is_some()))
            .transpose()?,
        attached_id: request
            .attached_id
            .map(|value| normalize_attached_id(value.as_deref()))
            .transpose()?,
        tags: request.tags.map(normalize_tags).transpose()?,
        pinned: request.pinned,
    })
}

pub(crate) fn apply_leaf_query(req: &Request, leaves: &mut Vec<Leaf>) -> Result<()> {
    let url = req.url()?;
    if let Some(query) = query_text(&url, "q").map(|value| value.to_ascii_lowercase()) {
        leaves.retain(|leaf| {
            serde_json::to_value(leaf)
                .ok()
                .is_some_and(|value| value_matches_query(&value, &query))
        });
    }
    if let Some(value) = query_text(&url, "visibility") {
        leaves.retain(|leaf| leaf.visibility == value);
    }
    if let Some(value) = query_text(&url, "tag") {
        leaves.retain(|leaf| leaf.tags.iter().any(|tag| tag == &value));
    }
    if let Some(value) = query_text(&url, "attached_type") {
        leaves.retain(|leaf| leaf.attached_type == value);
    }
    if let Some(value) = query_text(&url, "attached_id") {
        leaves.retain(|leaf| leaf.attached_id.as_deref() == Some(value.as_str()));
    }
    if url
        .query_pairs()
        .any(|(key, value)| key == "pinned" && value == "true")
    {
        leaves.retain(|leaf| leaf.pinned);
    }
    Ok(())
}

fn normalize_required(value: Option<&str>, name: &str) -> Result<String> {
    let value = value.map(str::trim).filter(|value| !value.is_empty());
    value
        .map(|value| value.chars().take(160).collect::<String>())
        .ok_or_else(|| Error::RustError(format!("missing field {name}")))
}

fn normalize_visibility(value: Option<&str>) -> Result<String> {
    let value = value.unwrap_or("tenant").trim().to_ascii_lowercase();
    if matches!(value.as_str(), "private" | "tenant" | "public") {
        return Ok(value);
    }
    Err(Error::RustError("invalid leaf visibility".to_string()))
}

fn normalize_attached_type(value: Option<&str>, project_scope: bool) -> Result<String> {
    let default_type = if project_scope { "project" } else { "tenant" };
    let value = value.unwrap_or(default_type).trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "tenant" | "project" | "branch" | "commit" | "issue" | "workspace" | "release"
    ) {
        return Ok(value);
    }
    Err(Error::RustError("invalid leaf attachment".to_string()))
}

fn normalize_attached_id(value: Option<&str>) -> Result<Option<String>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    if value.len() > 240 || value.chars().any(char::is_control) {
        return Err(Error::RustError("invalid leaf attachment".to_string()));
    }
    Ok(Some(value.to_string()))
}

fn normalize_tags(tags: Vec<String>) -> Result<Vec<String>> {
    let mut normalized = Vec::new();
    for tag in tags {
        let value = normalize_slug(&tag)?;
        if !normalized.contains(&value) {
            normalized.push(value);
        }
        if normalized.len() == 20 {
            break;
        }
    }
    Ok(normalized)
}

async fn unique_slug(
    database: &Database,
    tenant: &str,
    project: Option<&str>,
    value: &str,
    existing_id: Option<&str>,
) -> Result<String> {
    let base = normalize_slug(value)?;
    let mut slug = base.clone();
    let mut counter = 2;
    while d1::leaf_slug_exists(database, tenant, project, &slug, existing_id).await? {
        slug = format!("{base}-{counter}");
        counter += 1;
        if counter > 1000 {
            return Err(Error::RustError("leaf slug conflict".to_string()));
        }
    }
    Ok(slug)
}

fn normalize_slug(value: &str) -> Result<String> {
    let mut slug = String::new();
    let mut previous_dash = false;
    for ch in value.trim().to_ascii_lowercase().chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.') {
            slug.push(ch);
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
        if slug.len() >= 80 {
            break;
        }
    }
    let slug = slug.trim_matches('-').trim_matches('.').to_string();
    validate_segment(&slug).map_err(|_| Error::RustError("invalid leaf slug".to_string()))?;
    Ok(slug)
}
