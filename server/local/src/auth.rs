use anyhow::{Context, Result, bail};
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use sty_protocol::DEFAULT_AVE_CLIENT_ID;

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

pub async fn verify_ave_id_token(id_token: &str) -> Result<String> {
    let client_id =
        std::env::var("STY_AVE_CLIENT_ID").unwrap_or_else(|_| DEFAULT_AVE_CLIENT_ID.to_string());
    let issuer = std::env::var("STY_AVE_ISSUER").unwrap_or_else(|_| DEFAULT_AVE_ISSUER.to_string());
    let discovery = discovery_document(&issuer).await?;
    if discovery.issuer != issuer {
        bail!("Ave issuer mismatch");
    }
    let header = decode_header(id_token).context("invalid Ave id token header")?;
    if header.alg != Algorithm::RS256 {
        bail!("Ave id token must be signed with RS256");
    }
    let kid = header.kid.context("Ave id token is missing kid")?;
    let jwks = jwks(&discovery.jwks_uri).await?;
    let jwk = jwks.find(&kid).context("Ave signing key not found")?;
    let key = DecodingKey::from_jwk(jwk).context("could not load Ave signing key")?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[client_id]);
    validation.set_issuer(&[issuer]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    let token = decode::<AveClaims>(id_token, &key, &validation).context("invalid Ave id token")?;
    Ok(token.claims.sub)
}

async fn discovery_document(issuer: &str) -> Result<DiscoveryDocument> {
    let url = format!(
        "{}/.well-known/openid-configuration",
        issuer.trim_end_matches('/')
    );
    Ok(reqwest::get(url).await?.error_for_status()?.json().await?)
}

async fn jwks(uri: &str) -> Result<JwkSet> {
    Ok(reqwest::get(uri).await?.error_for_status()?.json().await?)
}
