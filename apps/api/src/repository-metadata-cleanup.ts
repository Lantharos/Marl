import type { Env } from './platform';

const batches = [
  ['branches', 'repository_id=?'],
  ['repository_entries', 'repository_id=?'],
  ['commit_changes', 'repository_id=?'],
  ['commits', 'repository_id=?'],
  ['issue_comments', 'issue_id IN (SELECT id FROM issues WHERE repository_id=?)'],
  ['issue_events', 'issue_id IN (SELECT id FROM issues WHERE repository_id=?)'],
  ['issues', 'repository_id=?'],
  ['review_comments', 'thread_id IN (SELECT id FROM review_threads WHERE pull_request_id IN (SELECT id FROM pull_requests WHERE repository_id=?))'],
  ['review_threads', 'pull_request_id IN (SELECT id FROM pull_requests WHERE repository_id=?)'],
  ['pull_request_comments', 'pull_request_id IN (SELECT id FROM pull_requests WHERE repository_id=?)'],
  ['pull_request_reviews', 'pull_request_id IN (SELECT id FROM pull_requests WHERE repository_id=?)'],
  ['pull_request_events', 'pull_request_id IN (SELECT id FROM pull_requests WHERE repository_id=?)'],
  ['pull_realtime_updates', 'pull_request_id IN (SELECT id FROM pull_requests WHERE repository_id=?)'],
  ['pull_requests', 'repository_id=?'],
  ['runs', 'repository_id=?'],
] as const;

export async function deleteRepositoryMetadata(env: Env, repositoryId: string) {
  for (const [table, predicate] of batches) {
    const result = await env.DB.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${predicate} LIMIT 200)`).bind(repositoryId).run();
    if (result.meta.changes >= 200) return false;
  }
  return true;
}
