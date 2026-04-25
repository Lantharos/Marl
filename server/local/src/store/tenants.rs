use std::fs;

use anyhow::{Result, bail};
use sty_protocol::{TenantMetadata, TenantSummary, TokenPrincipal, validate_segment};

use super::Store;

impl Store {
    pub fn create_org(&self, name: &str, principal: &TokenPrincipal) -> Result<TenantSummary> {
        validate_segment(name)?;
        if name == principal.user {
            bail!("org name is already reserved by your user tenant");
        }
        let path = self.tenant_metadata_path(name)?;
        if path.exists() {
            let metadata = self.tenant_metadata(name)?;
            if metadata
                .members
                .iter()
                .any(|member| member == &principal.user)
            {
                return Ok(tenant_summary(metadata));
            }
            bail!("tenant `{name}` already exists");
        }
        let metadata = TenantMetadata {
            name: name.to_string(),
            kind: "org".to_string(),
            owner: principal.user.clone(),
            members: vec![principal.user.clone()],
        };
        self.write_json(&path, &metadata)?;
        Ok(tenant_summary(metadata))
    }

    pub fn tenants(&self, principal: &TokenPrincipal) -> Result<Vec<TenantSummary>> {
        self.ensure_user_tenant(&principal.user)?;
        let mut tenants = Vec::new();
        for tenant in fs::read_dir(self.root.join("tenants"))? {
            let tenant = tenant?;
            if !tenant.file_type()?.is_dir() {
                continue;
            }
            let name = tenant.file_name().to_string_lossy().to_string();
            let metadata = self.tenant_metadata(&name)?;
            if metadata
                .members
                .iter()
                .any(|member| member == &principal.user)
            {
                tenants.push(tenant_summary(metadata));
            }
        }
        tenants.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(tenants)
    }

    pub(super) fn tenant_is_accessible(
        &self,
        tenant: &str,
        principal: &TokenPrincipal,
    ) -> Result<bool> {
        if tenant == principal.user {
            self.ensure_user_tenant(&principal.user)?;
            return Ok(true);
        }
        let path = self.tenant_metadata_path(tenant)?;
        if !path.exists() {
            return Ok(false);
        }
        Ok(self
            .tenant_metadata(tenant)?
            .members
            .iter()
            .any(|member| member == &principal.user))
    }

    pub(super) fn ensure_user_tenant(&self, user: &str) -> Result<()> {
        let path = self.tenant_metadata_path(user)?;
        if path.exists() {
            return Ok(());
        }
        let metadata = TenantMetadata {
            name: user.to_string(),
            kind: "user".to_string(),
            owner: user.to_string(),
            members: vec![user.to_string()],
        };
        self.write_json(&path, &metadata)
    }

    fn tenant_metadata(&self, tenant: &str) -> Result<TenantMetadata> {
        let path = self.tenant_metadata_path(tenant)?;
        if path.exists() {
            return Ok(serde_json::from_slice(&fs::read(path)?)?);
        }
        Ok(TenantMetadata {
            name: tenant.to_string(),
            kind: "user".to_string(),
            owner: tenant.to_string(),
            members: vec![tenant.to_string()],
        })
    }
}

fn tenant_summary(metadata: TenantMetadata) -> TenantSummary {
    TenantSummary {
        name: metadata.name,
        kind: metadata.kind,
        owner: metadata.owner,
    }
}
