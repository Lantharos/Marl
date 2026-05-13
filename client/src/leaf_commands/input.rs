use std::io::{self, Read};
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use sty_protocol::LeafRequest;

use crate::interactive;

pub(crate) fn with_attachment(
    mut request: LeafRequest,
    default_attachment: &str,
    attach: Option<String>,
) -> Result<LeafRequest> {
    let (kind, id) = match attach {
        Some(value) => parse_attachment(&value)?,
        None if interactive::can_prompt() => prompt_attachment(default_attachment)?,
        None => (default_attachment.to_string(), None),
    };
    request.attached_type = Some(kind);
    request.attached_id = Some(id);
    Ok(request)
}

pub(crate) fn resolve_title(title: Option<String>) -> Result<String> {
    match title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        Some(title) => Ok(title),
        None => interactive::prompt_text("Title", None),
    }
}

pub(crate) fn resolve_body(
    body: Option<String>,
    body_file: Option<PathBuf>,
) -> Result<Option<String>> {
    if body.is_some() && body_file.is_some() {
        bail!("--body cannot be combined with --body-file");
    }
    if let Some(body) = body {
        return Ok(Some(body));
    }
    let Some(path) = body_file else {
        return Ok(None);
    };
    if path.to_string_lossy() == "-" {
        let mut input = String::new();
        io::stdin().read_to_string(&mut input)?;
        return Ok(Some(input));
    }
    Ok(Some(std::fs::read_to_string(&path).with_context(|| {
        format!("failed to read {}", path.display())
    })?))
}

pub(crate) fn resolve_visibility(visibility: Option<String>) -> Result<String> {
    match visibility {
        Some(visibility) => validate_visibility(visibility),
        None if interactive::can_prompt() => {
            const ITEMS: &[&str] = &["Tenant", "Private", "Public"];
            const VALUES: &[&str] = &["tenant", "private", "public"];
            Ok(VALUES[interactive::select("Visibility", ITEMS, 0)?].to_string())
        }
        None => Ok("tenant".to_string()),
    }
}

pub(crate) fn validate_visibility(value: String) -> Result<String> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(value.as_str(), "private" | "tenant" | "public") {
        Ok(value)
    } else {
        bail!("invalid visibility `{value}`")
    }
}

pub(crate) fn split_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter()
        .flat_map(|tag| {
            tag.split(',')
                .map(str::trim)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .filter(|tag| !tag.is_empty())
        .collect()
}

fn parse_attachment(value: &str) -> Result<(String, Option<String>)> {
    let value = value.trim();
    let split_at = value.find([':', '=']);
    let (kind, id) = match split_at {
        Some(index) => (&value[..index], Some(value[index + 1..].trim().to_string())),
        None => (value, None),
    };
    let kind = validate_attachment_type(kind)?;
    if attachment_needs_id(&kind) && id.as_deref().unwrap_or_default().is_empty() {
        bail!("attachment `{kind}` needs a reference");
    }
    Ok((kind, id.filter(|value| !value.is_empty())))
}

fn prompt_attachment(default_attachment: &str) -> Result<(String, Option<String>)> {
    const LABELS: &[&str] = &[
        "Tenant",
        "Project",
        "Branch",
        "Commit",
        "Issue",
        "Workspace",
        "Release",
    ];
    const VALUES: &[&str] = &[
        "tenant",
        "project",
        "branch",
        "commit",
        "issue",
        "workspace",
        "release",
    ];
    let default = VALUES
        .iter()
        .position(|value| *value == default_attachment)
        .unwrap_or(0);
    let index = interactive::select("Attach leaf to", LABELS, default)?;
    let kind = VALUES[index].to_string();
    let id = if attachment_needs_id(&kind) {
        Some(interactive::prompt_text("Reference", None)?)
    } else {
        None
    };
    Ok((kind, id))
}

fn validate_attachment_type(value: &str) -> Result<String> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "tenant" | "project" | "branch" | "commit" | "issue" | "workspace" | "release"
    ) {
        Ok(value)
    } else {
        bail!("invalid leaf attachment `{value}`")
    }
}

fn attachment_needs_id(kind: &str) -> bool {
    !matches!(kind, "tenant" | "project")
}
