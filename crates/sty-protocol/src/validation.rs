pub fn validate_target(target: &str) -> anyhow::Result<(&str, &str)> {
    let Some((tenant, project)) = target.split_once('/') else {
        anyhow::bail!("project must be in tenant/project form");
    };
    validate_segment(tenant)?;
    validate_segment(project)?;
    Ok((tenant, project))
}

pub fn normalize_folder(value: Option<&str>) -> anyhow::Result<Option<String>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    normalize_folder_path(Some(value))
}

pub fn normalize_folder_path(value: Option<&str>) -> anyhow::Result<Option<String>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let normalized = value
        .split('/')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if normalized.is_empty() {
        return Ok(None);
    }
    for part in &normalized {
        validate_segment(part)?;
    }
    Ok(Some(normalized.join("/")))
}

pub fn validate_segment(value: &str) -> anyhow::Result<()> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        anyhow::bail!("invalid name segment `{value}`");
    }
    Ok(())
}

pub fn is_hex_id(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|ch| ch.is_ascii_hexdigit())
}
