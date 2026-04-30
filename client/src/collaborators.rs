use anyhow::{Result, bail};
use reqwest::blocking::Client;
use sty_protocol::{Collaborator, Paginated};

use crate::http::{RequestBuilderExt, response_error};

pub fn list_tenant(remote_url: &str, token: &str, tenant: &str) -> Result<()> {
    let url = format!(
        "{}/v1/tenants/{}/collaborators?all=true",
        remote_url.trim_end_matches('/'),
        tenant
    );
    let response = Client::new()
        .get(url)
        .bearer_auth(token)
        .send_request("Fetching collaborators")?;
    if !response.status().is_success() {
        bail!(
            "tenant collaborator list failed with status {}",
            response_error(response)
        );
    }
    print_collaborators(response.json::<Paginated<Collaborator>>()?.items);
    Ok(())
}

pub fn add_tenant(
    remote_url: &str,
    token: &str,
    tenant: &str,
    user: &str,
    role: &str,
) -> Result<()> {
    let url = format!(
        "{}/v1/tenants/{}/collaborators",
        remote_url.trim_end_matches('/'),
        tenant
    );
    let item = send_collaborator_mutation(
        Client::new()
            .post(url)
            .bearer_auth(token)
            .json(&serde_json::json!({ "user": user, "role": role })),
        "Adding collaborator",
        "tenant collaborator add",
    )?;
    println!("Added {} as {}", display_user(&item), item.role);
    Ok(())
}

pub fn update_tenant(
    remote_url: &str,
    token: &str,
    tenant: &str,
    user: &str,
    role: &str,
) -> Result<()> {
    let url = format!(
        "{}/v1/tenants/{}/collaborators/{}",
        remote_url.trim_end_matches('/'),
        tenant,
        encode_component(user)
    );
    let item = send_collaborator_mutation(
        Client::new()
            .patch(url)
            .bearer_auth(token)
            .json(&serde_json::json!({ "role": role })),
        "Updating collaborator",
        "tenant collaborator update",
    )?;
    println!("Updated {} to {}", display_user(&item), item.role);
    Ok(())
}

pub fn remove_tenant(remote_url: &str, token: &str, tenant: &str, user: &str) -> Result<()> {
    let url = format!(
        "{}/v1/tenants/{}/collaborators/{}",
        remote_url.trim_end_matches('/'),
        tenant,
        encode_component(user)
    );
    send_delete(
        url,
        token,
        "Removing collaborator",
        "tenant collaborator remove",
    )?;
    println!("Removed {user} from {tenant}");
    Ok(())
}

pub fn list_project(remote_url: &str, token: &str, tenant: &str, project: &str) -> Result<()> {
    let url = format!(
        "{}/v1/tenants/{}/projects/{}/collaborators?all=true",
        remote_url.trim_end_matches('/'),
        tenant,
        project
    );
    let response = Client::new()
        .get(url)
        .bearer_auth(token)
        .send_request("Fetching collaborators")?;
    if !response.status().is_success() {
        bail!(
            "project collaborator list failed with status {}",
            response_error(response)
        );
    }
    print_collaborators(response.json::<Paginated<Collaborator>>()?.items);
    Ok(())
}

pub fn add_project(
    remote_url: &str,
    token: &str,
    tenant: &str,
    project: &str,
    user: &str,
    role: &str,
) -> Result<()> {
    let url = format!(
        "{}/v1/tenants/{}/projects/{}/collaborators",
        remote_url.trim_end_matches('/'),
        tenant,
        project
    );
    let item = send_collaborator_mutation(
        Client::new()
            .post(url)
            .bearer_auth(token)
            .json(&serde_json::json!({ "user": user, "role": role })),
        "Adding collaborator",
        "project collaborator add",
    )?;
    println!("Added {} as {}", display_user(&item), item.role);
    Ok(())
}

pub fn update_project(
    remote_url: &str,
    token: &str,
    tenant: &str,
    project: &str,
    user: &str,
    role: &str,
) -> Result<()> {
    let url = format!(
        "{}/v1/tenants/{}/projects/{}/collaborators/{}",
        remote_url.trim_end_matches('/'),
        tenant,
        project,
        encode_component(user)
    );
    let item = send_collaborator_mutation(
        Client::new()
            .patch(url)
            .bearer_auth(token)
            .json(&serde_json::json!({ "role": role })),
        "Updating collaborator",
        "project collaborator update",
    )?;
    println!("Updated {} to {}", display_user(&item), item.role);
    Ok(())
}

pub fn remove_project(
    remote_url: &str,
    token: &str,
    tenant: &str,
    project: &str,
    user: &str,
) -> Result<()> {
    let url = format!(
        "{}/v1/tenants/{}/projects/{}/collaborators/{}",
        remote_url.trim_end_matches('/'),
        tenant,
        project,
        encode_component(user)
    );
    send_delete(
        url,
        token,
        "Removing collaborator",
        "project collaborator remove",
    )?;
    println!("Removed {user} from {tenant}/{project}");
    Ok(())
}

fn send_collaborator_mutation(
    request: reqwest::blocking::RequestBuilder,
    spinner: &str,
    label: &str,
) -> Result<Collaborator> {
    let response = request.send_request(spinner)?;
    if !response.status().is_success() {
        bail!("{label} failed with status {}", response_error(response));
    }
    Ok(response.json()?)
}

fn send_delete(url: String, token: &str, spinner: &str, label: &str) -> Result<()> {
    let response = Client::new()
        .delete(url)
        .bearer_auth(token)
        .send_request(spinner)?;
    if !response.status().is_success() {
        bail!("{label} failed with status {}", response_error(response));
    }
    Ok(())
}

fn print_collaborators(items: Vec<Collaborator>) {
    if items.is_empty() {
        println!("No collaborators");
        return;
    }
    for item in items {
        println!(
            "{}  {}  {}",
            display_user(&item),
            item.role,
            source_label(&item)
        );
    }
}

fn display_user(item: &Collaborator) -> String {
    item.profile
        .as_ref()
        .and_then(|profile| profile.handle.as_deref())
        .or_else(|| {
            item.profile
                .as_ref()
                .map(|profile| profile.display_name.as_str())
        })
        .unwrap_or(item.user.as_str())
        .to_string()
}

fn source_label(item: &Collaborator) -> &str {
    match item.source.as_str() {
        "owner" => "owner",
        "tenant" => "via tenant",
        "project" => "project",
        _ => item.source.as_str(),
    }
}

fn encode_component(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            byte => format!("%{byte:02X}").chars().collect(),
        })
        .collect()
}
