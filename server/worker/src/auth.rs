use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use sty_protocol::DEFAULT_AVE_CLIENT_ID;
use worker::*;

const DEFAULT_AVE_ISSUER: &str = "https://aveid.net";

#[derive(Debug, Deserialize)]
struct DiscoveryDocument {
    issuer: String,
    jwks_uri: String,
}

#[derive(Debug, Deserialize)]
struct AveClaims {
    sub: String,
}

pub async fn verify_ave_id_token(env: &Env, id_token: &str) -> Result<String> {
    let issuer = env_string(env, "AVE_ISSUER").unwrap_or_else(|_| DEFAULT_AVE_ISSUER.to_string());
    let client_id =
        env_string(env, "AVE_CLIENT_ID").unwrap_or_else(|_| DEFAULT_AVE_CLIENT_ID.to_string());
    let discovery = discovery_document(&issuer).await?;
    if discovery.issuer != issuer {
        return Err(Error::RustError("Ave issuer mismatch".to_string()));
    }
    let header = decode_header(id_token).map_err(|error| Error::RustError(error.to_string()))?;
    if header.alg != Algorithm::RS256 {
        return Err(Error::RustError(
            "Ave id token must be signed with RS256".to_string(),
        ));
    }
    let Some(kid) = header.kid else {
        return Err(Error::RustError("Ave id token is missing kid".to_string()));
    };
    let jwks = jwks(&discovery.jwks_uri).await?;
    let Some(jwk) = jwks.find(&kid) else {
        return Err(Error::RustError("Ave signing key not found".to_string()));
    };
    let key = DecodingKey::from_jwk(jwk).map_err(|error| Error::RustError(error.to_string()))?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[client_id]);
    validation.set_issuer(&[issuer]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    let token = decode::<AveClaims>(id_token, &key, &validation)
        .map_err(|error| Error::RustError(error.to_string()))?;
    Ok(token.claims.sub)
}

pub fn dev_tokens_enabled(env: &Env) -> bool {
    env_string(env, "STY_DEV_TOKENS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

async fn discovery_document(issuer: &str) -> Result<DiscoveryDocument> {
    let url = Url::parse(&format!(
        "{}/.well-known/openid-configuration",
        issuer.trim_end_matches('/')
    ))?;
    let mut response = Fetch::Url(url).send().await?;
    if !(200..300).contains(&response.status_code()) {
        return Err(Error::RustError("Ave discovery request failed".to_string()));
    }
    response.json().await
}

async fn jwks(uri: &str) -> Result<JwkSet> {
    let url = Url::parse(uri)?;
    let mut response = Fetch::Url(url).send().await?;
    if !(200..300).contains(&response.status_code()) {
        return Err(Error::RustError("Ave JWKS request failed".to_string()));
    }
    response.json().await
}

fn env_string(env: &Env, name: &str) -> Result<String> {
    env.var(name).map(|value| value.to_string())
}
