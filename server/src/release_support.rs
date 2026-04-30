use serde_json::json;
use sha2::{Digest, Sha256};
use worker::*;

pub(crate) async fn ensure_tag(
    database: &D1Database,
    tenant: &str,
    project: &str,
    tag: &str,
    user: &str,
    snapshot: Option<&str>,
) -> Result<serde_json::Value> {
    if let Some(item) = list_protocol_values(database, tenant, project, "tag")
        .await?
        .into_iter()
        .find(|item| {
            item["tag"].as_str() == Some(tag)
                || item["name"].as_str() == Some(tag)
                || item["id"].as_str() == Some(tag)
        })
    {
        return Ok(item);
    }
    let now = now_iso();
    let id = tag_id(tenant, project, tag);
    let mut item = json!({
        "id": id,
        "tag": tag,
        "name": tag,
        "author": user,
        "created_at": now,
        "updated_at": now,
    });
    if let Some(snapshot) = snapshot {
        item["snapshot"] = json!(snapshot);
    }
    upsert_protocol_item(
        database,
        tenant,
        project,
        "tag",
        item["id"].as_str().unwrap(),
        item.clone(),
    )
    .await?;
    Ok(item)
}

pub(crate) async fn list_release_values(
    database: &D1Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<serde_json::Value>> {
    list_protocol_values(database, tenant, project, "release").await
}

pub(crate) async fn list_protocol_values(
    database: &D1Database,
    tenant: &str,
    project: &str,
    kind: &str,
) -> Result<Vec<serde_json::Value>> {
    let result = database
        .prepare(
            "SELECT data_json FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = ?3 ORDER BY created_at DESC",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(kind)])?
        .all()
        .await?;
    #[derive(serde::Deserialize)]
    struct Row {
        data_json: String,
    }
    let rows: Vec<Row> = result.results()?;
    Ok(rows
        .into_iter()
        .filter_map(|row| serde_json::from_str::<serde_json::Value>(&row.data_json).ok())
        .collect())
}

pub(crate) async fn release_item_by_id_or_tag(
    database: &D1Database,
    tenant: &str,
    project: &str,
    id_or_tag: &str,
) -> Result<Option<serde_json::Value>> {
    if let Some(item) = release_item(database, tenant, project, id_or_tag).await? {
        return Ok(Some(item));
    }
    Ok(list_release_values(database, tenant, project)
        .await?
        .into_iter()
        .find(|item| item["tag"].as_str() == Some(id_or_tag)))
}

pub(crate) async fn upsert_release(
    database: &D1Database,
    tenant: &str,
    project: &str,
    id: &str,
    item: serde_json::Value,
) -> Result<()> {
    upsert_protocol_item(database, tenant, project, "release", id, item).await
}

pub(crate) fn release_artifact<'a>(
    release: &'a serde_json::Value,
    artifact_id: &str,
) -> Option<&'a serde_json::Value> {
    release["artifacts"]
        .as_array()?
        .iter()
        .find(|artifact| artifact["id"].as_str() == Some(artifact_id))
}

pub(crate) fn release_id(tenant: &str, project: &str, tag: &str) -> String {
    let digest = hex::encode(Sha256::digest(
        format!("{tenant}/{project}:{tag}").as_bytes(),
    ));
    format!("release:{}", &digest[..24])
}

pub(crate) fn release_artifact_key(
    tenant: &str,
    project: &str,
    release_id: &str,
    artifact_id: &str,
    file_name: &str,
) -> String {
    let release_key = release_id.replace(['/', '\\'], "_");
    format!(
        "projects/{tenant}/{project}/releases/{release_key}/artifacts/{artifact_id}/{file_name}"
    )
}

pub(crate) fn release_artifact_download_url(
    tenant: &str,
    project: &str,
    release_id: &str,
    artifact_id: &str,
) -> String {
    format!(
        "/v1/tenants/{}/projects/{}/releases/{}/artifacts/{}/download",
        tenant,
        project,
        percent_encode_component(release_id),
        artifact_id
    )
}

pub(crate) fn safe_file_name(value: &str) -> String {
    let safe = value
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | '"' | '\0'..='\u{1f}' => '_',
            ch => ch,
        })
        .collect::<String>();
    if safe.trim().is_empty() {
        "artifact.bin".to_string()
    } else {
        safe
    }
}

pub(crate) fn normalize_content_type(value: &str) -> String {
    if value.trim().is_empty() {
        "application/octet-stream".to_string()
    } else {
        value.to_string()
    }
}

pub(crate) fn now_iso() -> String {
    js_sys::Date::new_0()
        .to_iso_string()
        .as_string()
        .unwrap_or_default()
}

async fn release_item(
    database: &D1Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<Option<serde_json::Value>> {
    #[derive(serde::Deserialize)]
    struct Row {
        data_json: String,
    }
    let row: Option<Row> = database
        .prepare(
            "SELECT data_json FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = 'release' AND id = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(id)])?
        .first(None)
        .await?;
    row.map(|row| {
        serde_json::from_str(&row.data_json).map_err(|error| Error::RustError(error.to_string()))
    })
    .transpose()
}

async fn upsert_protocol_item(
    database: &D1Database,
    tenant: &str,
    project: &str,
    kind: &str,
    id: &str,
    item: serde_json::Value,
) -> Result<()> {
    let now = now_iso();
    let data_json =
        serde_json::to_string(&item).map_err(|error| Error::RustError(error.to_string()))?;
    database
        .prepare(
            "INSERT INTO protocol_items (id, tenant, project, kind, number, data_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?6)
             ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at",
        )
        .bind(&[
            js_str(id),
            js_str(tenant),
            js_str(project),
            js_str(kind),
            js_str(&data_json),
            js_str(&now),
        ])?
        .run()
        .await?;
    Ok(())
}

fn tag_id(tenant: &str, project: &str, tag: &str) -> String {
    let digest = hex::encode(Sha256::digest(
        format!("{tenant}/{project}:{tag}").as_bytes(),
    ));
    format!("tag:{}", &digest[..24])
}

fn percent_encode_component(value: &str) -> String {
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

fn js_str(value: &str) -> wasm_bindgen::JsValue {
    wasm_bindgen::JsValue::from_str(value)
}
