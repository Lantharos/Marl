use serde_json::json;
use sha2::{Digest, Sha256};
use worker::*;

pub(crate) async fn ensure_tag(
    database: &crate::request_context::Database,
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
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
) -> Result<Vec<serde_json::Value>> {
    list_protocol_values(database, tenant, project, "release").await
}

pub(crate) async fn clear_latest_releases(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    except_id: &str,
) -> Result<()> {
    for mut item in list_release_values(database, tenant, project).await? {
        let Some(id) = item["id"].as_str().map(ToOwned::to_owned) else {
            continue;
        };
        if id == except_id || !item["latest"].as_bool().unwrap_or(false) {
            continue;
        }
        item["latest"] = json!(false);
        upsert_release(database, tenant, project, &id, item).await?;
    }
    Ok(())
}

pub(crate) async fn release_snapshot_is_published(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    snapshot: &str,
) -> Result<bool> {
    Ok(list_release_values(database, tenant, project)
        .await?
        .into_iter()
        .any(|item| {
            let item_snapshot = item["snapshot"]
                .as_str()
                .or_else(|| item["source"]["snapshot"].as_str());
            item_snapshot == Some(snapshot) && !item["draft"].as_bool().unwrap_or(false)
        }))
}

pub(crate) async fn list_protocol_values(
    database: &crate::request_context::Database,
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
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    id_or_tag: &str,
) -> Result<Option<serde_json::Value>> {
    let decoded = percent_decode_component(id_or_tag);
    let decoded_twice = percent_decode_component(&decoded);
    let mut candidates = vec![id_or_tag.to_string()];
    if decoded != id_or_tag {
        candidates.push(decoded.clone());
    }
    if decoded_twice != decoded && decoded_twice != id_or_tag {
        candidates.push(decoded_twice);
    }
    for candidate in &candidates {
        if let Some(item) = release_item(database, tenant, project, candidate).await? {
            return Ok(Some(item));
        }
    }
    Ok(list_release_values(database, tenant, project)
        .await?
        .into_iter()
        .find(|item| {
            let tag = item["tag"].as_str();
            candidates
                .iter()
                .any(|candidate| tag == Some(candidate.as_str()))
        }))
}

pub(crate) async fn upsert_release(
    database: &crate::request_context::Database,
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

pub(crate) fn release_source_artifact_id() -> &'static str {
    "source-zip"
}

pub(crate) fn release_source_artifact_key(
    tenant: &str,
    project: &str,
    release_id: &str,
    file_name: &str,
) -> String {
    let release_key = release_id.replace(['/', '\\'], "_");
    format!("projects/{tenant}/{project}/releases/{release_key}/source/{file_name}")
}

pub(crate) fn release_source_artifact_name(project: &str, tag: &str) -> String {
    safe_file_name(&format!("{project}-{tag}.zip"))
}

pub(crate) fn release_has_source_artifact(release: &serde_json::Value) -> bool {
    release["artifacts"]
        .as_array()
        .map(|items| {
            items.iter().any(|artifact| {
                artifact["source"].as_bool().unwrap_or(false)
                    || artifact["id"].as_str() == Some(release_source_artifact_id())
            })
        })
        .unwrap_or(false)
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

pub(crate) async fn delete_release_item(
    database: &crate::request_context::Database,
    tenant: &str,
    project: &str,
    id: &str,
) -> Result<()> {
    database
        .prepare(
            "DELETE FROM protocol_items WHERE tenant = ?1 AND project = ?2 AND kind = 'release' AND id = ?3",
        )
        .bind(&[js_str(tenant), js_str(project), js_str(id)])?
        .run()
        .await?;
    Ok(())
}

async fn release_item(
    database: &crate::request_context::Database,
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
    database: &crate::request_context::Database,
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

fn percent_decode_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = hex_value(bytes[i + 1]);
            let lo = hex_value(bytes[i + 2]);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                output.push((hi << 4) | lo);
                i += 3;
                continue;
            }
        }
        output.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(output).unwrap_or_else(|_| value.to_string())
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn js_str(value: &str) -> wasm_bindgen::JsValue {
    wasm_bindgen::JsValue::from_str(value)
}
