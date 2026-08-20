export function commitAuthorIdSql(commitAlias = 'commits') {
  return `COALESCE(${commitAlias}.signature_signer_id,(SELECT matched_users.id FROM users AS matched_users WHERE ${commitAlias}.author_email!='' AND matched_users.email=${commitAlias}.author_email COLLATE NOCASE LIMIT 1),(SELECT matched_users.id FROM users AS matched_users WHERE matched_users.handle=${commitAlias}.author_name COLLATE NOCASE LIMIT 1),(SELECT matched_users.id FROM users AS matched_users WHERE matched_users.display_name=${commitAlias}.author_name COLLATE NOCASE ORDER BY matched_users.id LIMIT 1))`;
}
