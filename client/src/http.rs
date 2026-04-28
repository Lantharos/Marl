use serde_json::Value;

use crate::spinner;

pub trait RequestBuilderExt {
    fn send_request(self, message: &str) -> reqwest::Result<reqwest::blocking::Response>;
}

impl RequestBuilderExt for reqwest::blocking::RequestBuilder {
    fn send_request(self, message: &str) -> reqwest::Result<reqwest::blocking::Response> {
        spinner::run(message, || self.send())
    }
}

pub fn response_error(response: reqwest::blocking::Response) -> String {
    let status = response.status();
    let body = response.text().unwrap_or_default();
    let message = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .filter(|message| !message.trim().is_empty())
        .unwrap_or(body);
    format!("{status}: {message}")
}
