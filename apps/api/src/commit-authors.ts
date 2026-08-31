export function commitAuthorIdSql(commitAlias = 'commits') {
  return `CASE WHEN ${commitAlias}.signature_status='verified' THEN ${commitAlias}.signature_signer_id END`;
}
