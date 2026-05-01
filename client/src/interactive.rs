use std::env;
use std::io::{self, IsTerminal};

use anyhow::{Result, bail};
use dialoguer::{Input, Select, theme::ColorfulTheme};
use sty_protocol::{TenantSummary, validate_segment};

pub(crate) enum TenantChoice {
    Existing(String),
    New(String),
}

pub(crate) fn can_prompt() -> bool {
    io::stdin().is_terminal() && io::stdout().is_terminal()
}

pub(crate) fn require_prompt(message: &str) -> Result<()> {
    if can_prompt() {
        Ok(())
    } else {
        bail!("{message}")
    }
}

pub(crate) fn choose_tenant(tenants: &[TenantSummary]) -> Result<TenantChoice> {
    require_prompt("missing tenant; pass --tenant or --new-tenant")?;
    let theme = ColorfulTheme::default();
    let mut items = tenants.iter().map(tenant_label).collect::<Vec<String>>();
    items.push("Create new tenant".to_string());
    let index = Select::with_theme(&theme)
        .with_prompt("Tenant")
        .items(&items)
        .default(0)
        .interact()?;
    if index == tenants.len() {
        return Ok(TenantChoice::New(prompt_segment(
            "New tenant",
            None,
            "tenant",
        )?));
    }
    Ok(TenantChoice::Existing(tenants[index].name.clone()))
}

pub(crate) fn prompt_project_name() -> Result<String> {
    let default = default_project_name();
    prompt_segment("Project name", Some(default), "project")
}

pub(crate) fn prompt_tenant_name() -> Result<String> {
    prompt_segment("Tenant name", None, "tenant")
}

fn prompt_segment(prompt: &str, default: Option<String>, label: &'static str) -> Result<String> {
    require_prompt(&format!("missing {label}; pass --{label}"))?;
    let theme = ColorfulTheme::default();
    let mut input = Input::<String>::with_theme(&theme).with_prompt(prompt);
    if let Some(default) = default {
        input = input.default(default);
    }
    Ok(input
        .validate_with(move |value: &String| match validate_segment(value.trim()) {
            Ok(()) => Ok(()),
            Err(error) => Err(error.to_string()),
        })
        .interact_text()?
        .trim()
        .to_string())
}

fn default_project_name() -> String {
    let Some(name) = env::current_dir().ok().and_then(|path| {
        path.file_name()
            .map(|name| name.to_string_lossy().to_string())
    }) else {
        return "project".to_string();
    };
    if validate_segment(&name).is_ok() {
        return name;
    }
    let sanitized = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if sanitized.is_empty() || validate_segment(&sanitized).is_err() {
        "project".to_string()
    } else {
        sanitized
    }
}

fn tenant_label(tenant: &TenantSummary) -> String {
    if tenant.kind == "user" {
        format!("{} (personal)", tenant.name)
    } else {
        tenant.name.clone()
    }
}
