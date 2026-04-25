use std::sync::Arc;

use axum::Router;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use reqwest::StatusCode;
use serde_json::json;
use sha2::{Digest, Sha256};
use sty_local_server::server;
use sty_local_server::store::Store;
use sty_protocol::RemoteObject;

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

    let other_token: serde_json::Value = client
        .post(format!("{base_url}/v1/dev/tokens"))
        .json(&json!({ "user": "other" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let denied_project_create = client
        .post(&project_url)
        .bearer_auth(other_token["token"].as_str().unwrap())
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(denied_project_create.status(), StatusCode::FORBIDDEN);

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

async fn spawn_server() -> (String, String) {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(Store::new(dir.path().to_path_buf()).unwrap());
    let token = store.add_token("dev").unwrap();
    std::mem::forget(dir);
    let app: Router = server::router(store);
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
