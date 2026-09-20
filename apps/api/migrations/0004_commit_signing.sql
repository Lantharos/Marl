ALTER TABLE users ADD COLUMN signing_mode TEXT NOT NULL DEFAULT 'optional' CHECK (signing_mode IN ('optional','vigilant','firewall'));
ALTER TABLE repositories ADD COLUMN signing_mode TEXT NOT NULL DEFAULT 'optional' CHECK (signing_mode IN ('optional','vigilant','firewall'));
