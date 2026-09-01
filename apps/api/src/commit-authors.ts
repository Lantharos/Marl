export function commitAuthorIdSql(commitAlias = 'commits') {
  return `COALESCE(CASE WHEN ${commitAlias}.signature_status='verified' THEN ${commitAlias}.signature_signer_id END,(SELECT user_emails.user_id FROM user_emails WHERE user_emails.email=${commitAlias}.author_email COLLATE NOCASE AND user_emails.verified_at IS NOT NULL LIMIT 1))`;
}
