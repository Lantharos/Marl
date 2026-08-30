CREATE TABLE auth_account_v17 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  issuer TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  id_token TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (issuer, account_id)
);

INSERT INTO auth_account_v17 (
  id,
  user_id,
  account_id,
  issuer,
  provider_id,
  access_token,
  refresh_token,
  access_token_expires_at,
  refresh_token_expires_at,
  scope,
  id_token,
  password,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  account_id,
  CASE provider_id
    WHEN 'credential' THEN 'local:credential'
    WHEN 'ave' THEN 'local:oauth:ave'
    ELSE 'local:oauth:' || provider_id
  END,
  provider_id,
  access_token,
  refresh_token,
  access_token_expires_at,
  refresh_token_expires_at,
  scope,
  id_token,
  password,
  created_at,
  updated_at
FROM auth_account;

DROP TABLE auth_account;
ALTER TABLE auth_account_v17 RENAME TO auth_account;
CREATE INDEX auth_accounts_by_user ON auth_account(user_id, provider_id);
