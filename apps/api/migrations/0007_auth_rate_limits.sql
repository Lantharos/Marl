CREATE TABLE auth_rate_limit (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  last_request INTEGER NOT NULL
);
