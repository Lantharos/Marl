ALTER TABLE commits ADD COLUMN signature_signer_id TEXT REFERENCES users(id);
ALTER TABLE commits ADD COLUMN signature_key_fingerprint TEXT;

CREATE INDEX commits_signature_signer ON commits(signature_signer_id,signature_key_fingerprint);

CREATE TRIGGER ssh_keys_invalidate_commit_signatures
AFTER DELETE ON ssh_keys
BEGIN
  UPDATE commits
  SET signature_status = 'unverified', signature_signer_id = NULL, signature_key_fingerprint = NULL
  WHERE signature_signer_id = OLD.user_id AND signature_key_fingerprint = OLD.fingerprint;
END;
