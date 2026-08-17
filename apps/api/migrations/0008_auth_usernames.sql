ALTER TABLE auth_user ADD COLUMN username TEXT;
ALTER TABLE auth_user ADD COLUMN display_username TEXT;

CREATE UNIQUE INDEX auth_user_username_unique ON auth_user(username COLLATE NOCASE) WHERE username IS NOT NULL;
