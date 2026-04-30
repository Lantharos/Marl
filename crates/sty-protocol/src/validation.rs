pub fn validate_target(target: &str) -> anyhow::Result<(&str, &str)> {
    let Some((tenant, project)) = target.split_once('/') else {
        anyhow::bail!("project must be in tenant/project form");
    };
    validate_segment(tenant)?;
    validate_segment(project)?;
    Ok((tenant, project))
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
