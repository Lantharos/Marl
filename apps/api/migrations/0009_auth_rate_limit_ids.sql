CREATE TABLE auth_rate_limit_next (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  last_request INTEGER NOT NULL
);

INSERT INTO auth_rate_limit_next (id, key, count, last_request)
SELECT 'rate_' || lower(hex(randomblob(16))), key, count, last_request
FROM auth_rate_limit;

DROP TABLE auth_rate_limit;

ALTER TABLE auth_rate_limit_next RENAME TO auth_rate_limit;
