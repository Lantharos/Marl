use std::sync::Arc;

use axum::Router;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use reqwest::StatusCode;
use serde_json::json;
use sha2::{Digest, Sha256};
use sty_local_server::server;
use sty_local_server::store::{ObjectStore, Store};
use sty_protocol::RemoteObject;
use sty_store::Store as StoreTrait;

#[tokio::test]
async fn auth_compare_and_cas_follow_remote_contract() {
    let (base_url, token) = spawn_server().await;
    let client = reqwest::Client::new();

    let ok = client
        .post(format!("{base_url}/v1/auth/check"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(ok.status(), StatusCode::OK);

    let denied = client
        .post(format!("{base_url}/v1/auth/check"))
        .bearer_auth("bad")
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);

    let project_url = format!("{base_url}/v1/tenants/dev/projects/demo");
    assert_ok(
        client
            .post(&project_url)
            .bearer_auth(&token)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
    );

    let listed: serde_json::Value = client
        .get(format!("{base_url}/v1/projects"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(listed["projects"][0]["tenant"], "dev");
    assert_eq!(listed["projects"][0]["owner"], "dev");

    let base = snapshot("base", vec![]);
    let left = snapshot("left", vec![base.id.clone()]);
    let right = snapshot("right", vec![base.id.clone()]);

    assert_ok(
        client
            .post(format!("{project_url}/objects/upload"))
            .bearer_auth(&token)
            .json(&json!({ "objects": [base, left, right] }))
            .send()
            .await
            .unwrap()
            .status(),
    );

    assert_ok(
        client
            .put(format!("{project_url}/workspaces/main/head"))
            .bearer_auth(&token)
            .json(&json!({ "expected_head": null, "new_head": base.id }))
            .send()
            .await
            .unwrap()
            .status(),
    );

    let unknown_local: serde_json::Value = client
        .post(format!("{project_url}/workspaces/main/compare"))
        .bearer_auth(&token)
        .json(&json!({ "local_head": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(unknown_local["relation"], "diverged");

    let compare: serde_json::Value = client
        .post(format!("{project_url}/workspaces/main/compare"))
        .bearer_auth(&token)
        .json(&json!({ "local_head": left.id }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(compare["relation"], "local_ahead");

    assert_ok(
        client
            .put(format!("{project_url}/workspaces/main/head"))
            .bearer_auth(&token)
            .json(&json!({ "expected_head": base.id, "new_head": right.id }))
            .send()
            .await
            .unwrap()
            .status(),
    );

    let stale = client
        .put(format!("{project_url}/workspaces/main/head"))
        .bearer_auth(&token)
        .json(&json!({ "expected_head": base.id, "new_head": left.id }))
        .send()
        .await
        .unwrap();
    assert_eq!(stale.status(), StatusCode::CONFLICT);

    let diverged: serde_json::Value = client
        .post(format!("{project_url}/workspaces/main/compare"))
        .bearer_auth(&token)
        .json(&json!({ "local_head": left.id }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(diverged["relation"], "diverged");
}

#[tokio::test]
async fn chunked_object_upload_assembles_and_validates_bytes() {
    let (base_url, token) = spawn_server().await;
    let client = reqwest::Client::new();
    let project_url = format!("{base_url}/v1/tenants/dev/projects/demo");
    assert_ok(
        client
            .post(&project_url)
            .bearer_auth(&token)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
    );

    let bytes = b"alpha-beta-gamma-delta".repeat(128);
    let id = hex::encode(Sha256::digest(&bytes));
    let chunks = bytes.chunks(257).collect::<Vec<_>>();
    for (index, chunk) in chunks.iter().enumerate() {
        assert_ok(
            client
                .put(format!("{project_url}/objects/{id}/chunks/{index}"))
                .bearer_auth(&token)
                .header("x-pig-object-kind", "blob")
                .header("x-pig-chunk-count", chunks.len().to_string())
                .header("x-pig-total-size", bytes.len().to_string())
                .body((*chunk).to_vec())
                .send()
                .await
                .unwrap()
                .status(),
        );
    }
    assert_ok(
        client
            .post(format!("{project_url}/objects/{id}/complete"))
            .bearer_auth(&token)
            .json(&json!({
                "kind": "blob",
                "total_size": bytes.len(),
                "chunk_count": chunks.len()
            }))
            .send()
            .await
            .unwrap()
            .status(),
    );

    let downloaded: serde_json::Value = client
        .post(format!("{project_url}/objects/download"))
        .bearer_auth(&token)
        .json(&json!({ "ids": [id] }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(downloaded["objects"][0]["kind"], "blob");
    let restored = BASE64
        .decode(downloaded["objects"][0]["bytes_base64"].as_str().unwrap())
        .unwrap();
    assert_eq!(restored, bytes);
}

#[tokio::test]
async fn optional_capabilities_and_issue_metadata_follow_protocol_shape() {
    let (base_url, token) = spawn_server().await;
    let client = reqwest::Client::new();
    let capabilities: serde_json::Value = client
        .get(format!("{base_url}/v1/capabilities"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(capabilities["version"], "1.0");
    assert!(
        capabilities["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item == "issues")
    );
    assert!(
        !capabilities["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item == "ci")
    );
    assert!(
        !capabilities["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item == "e2ee")
    );

    let project_url = format!("{base_url}/v1/tenants/dev/projects/demo");
    assert_ok(
        client
            .post(&project_url)
            .bearer_auth(&token)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
    );

    let issue: serde_json::Value = client
        .post(format!("{project_url}/issues"))
        .bearer_auth(&token)
        .json(&json!({
            "title": "wire issue metadata",
            "body": "labels and assignees round trip",
            "labels": ["backend"],
            "assignee": "dev"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(issue["state"], "open");
    assert_eq!(issue["labels"], json!(["backend"]));
    assert_eq!(issue["assignees"], json!(["dev"]));

    let issue_id = issue["id"].as_str().unwrap();
    let labeled: serde_json::Value = client
        .post(format!("{project_url}/issues/{issue_id}/labels"))
        .bearer_auth(&token)
        .json(&json!({ "label": "frontend" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(labeled["labels"], json!(["backend", "frontend"]));

    let assigned: serde_json::Value = client
        .post(format!("{project_url}/issues/{issue_id}/assignees"))
        .bearer_auth(&token)
        .json(&json!({ "user": "agent" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(assigned["assignees"], json!(["dev", "agent"]));

    let closed: serde_json::Value = client
        .post(format!("{project_url}/issues/{issue_id}/close"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(closed["state"], "closed");
    assert!(closed["closed_at"].as_str().is_some());
}

#[tokio::test]
async fn protocol_collections_are_paginated_and_mutable() {
    let (base_url, token) = spawn_server().await;
    let client = reqwest::Client::new();
    let project_url = format!("{base_url}/v1/tenants/dev/projects/demo");
    assert_ok(
        client
            .post(&project_url)
            .bearer_auth(&token)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
    );

    for name in ["bug", "feature"] {
        assert_ok(
            client
                .post(format!("{project_url}/labels"))
                .bearer_auth(&token)
                .json(&json!({ "name": name, "color": "#d9a66c" }))
                .send()
                .await
                .unwrap()
                .status(),
        );
    }
    assert_ok(
        client
            .post(format!("{project_url}/milestones"))
            .bearer_auth(&token)
            .json(&json!({ "title": "v1", "description": "first ship" }))
            .send()
            .await
            .unwrap()
            .status(),
    );
    assert_ok(
        client
            .post(format!("{project_url}/tags"))
            .bearer_auth(&token)
            .json(&json!({ "tag": "v1.0.0", "snapshot": "abc123" }))
            .send()
            .await
            .unwrap()
            .status(),
    );
    assert_ok(
        client
            .post(format!("{project_url}/releases"))
            .bearer_auth(&token)
            .json(&json!({ "tag": "v1.0.0", "name": "v1.0.0", "notes": "ship it" }))
            .send()
            .await
            .unwrap()
            .status(),
    );

    let labels: serde_json::Value = client
        .get(format!("{project_url}/labels?page=1&per_page=1"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(labels["page"], 1);
    assert_eq!(labels["per_page"], 1);
    assert_eq!(labels["total"], 2);
    assert_eq!(labels["next"], 2);
    assert_eq!(labels["items"].as_array().unwrap().len(), 1);

    let milestones: serde_json::Value = client
        .get(format!("{project_url}/milestones"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(milestones["items"][0]["state"], "open");

    let releases: serde_json::Value = client
        .get(format!("{project_url}/releases"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(releases["items"][0]["tag"], "v1.0.0");

    assert_ok(
        client
            .delete(format!("{project_url}/labels/bug"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .status(),
    );
    let labels: serde_json::Value = client
        .get(format!("{project_url}/labels"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(labels["total"], 1);
}

async fn spawn_server() -> (String, String) {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(Store::new(dir.path().to_path_buf()).unwrap());
    let objects = Arc::new(ObjectStore::new(dir.path().to_path_buf()));
    let token = store.add_token("dev").unwrap();
    std::mem::forget(dir);
    let app: Router = server::router(store, objects);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (format!("http://{addr}"), token)
}

fn snapshot(name: &str, parents: Vec<String>) -> RemoteObject {
    let bytes = serde_json::to_vec(&json!({ "parents": parents, "message": name })).unwrap();
    let id = hex::encode(Sha256::digest(&bytes));
    RemoteObject {
        id,
        kind: "snapshot".to_string(),
        bytes_base64: BASE64.encode(bytes),
    }
}

fn assert_ok(status: StatusCode) {
    assert!(status.is_success(), "{status}");
}
