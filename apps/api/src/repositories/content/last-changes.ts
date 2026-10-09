import type { Env } from '../../core/platform';

export type LastChange = { path: string; commitId: string; message: string; author: string; updatedAt: string };
type LastChangeRow = { [Key in keyof LastChange]: LastChange[Key] | null } & {
  position: number | null;
  summarized: number;
  complete: number;
};
type Summary = Record<string, [commitId: string, position: number, authoredAt: string]>;

const summarizedEntryLimit = 2_000;

const lastChangesSql = `WITH RECURSIVE requested(path) AS (SELECT value FROM json_each(?1)),
walk(id) AS (SELECT ?2 UNION SELECT json_each.value FROM walk JOIN commits ON commits.repository_id=?3 AND commits.id=walk.id JOIN json_each(commits.parent_ids) WHERE NOT EXISTS (SELECT 1 FROM directory_last_changes WHERE repository_id=?3 AND commit_id=walk.id AND path=?4)),
candidates AS (
  SELECT commit_changes.path,commit_changes.commit_id AS commitId,commit_changes.position,commits.authored_at AS authoredAt FROM walk CROSS JOIN commit_changes ON commit_changes.repository_id=?3 AND commit_changes.commit_id=walk.id AND +commit_changes.path IN (SELECT path FROM requested) CROSS JOIN commits ON commits.repository_id=?3 AND commits.id=walk.id
  UNION ALL
  SELECT stored.key,stored.value->>0,stored.value->>1,stored.value->>2 FROM walk CROSS JOIN directory_last_changes AS summary ON summary.repository_id=?3 AND summary.commit_id=walk.id AND summary.path=?4 JOIN json_each(summary.changes) AS stored WHERE stored.key IN (SELECT path FROM requested)
),
ranked AS (SELECT path,commitId,position,ROW_NUMBER() OVER (PARTITION BY path ORDER BY position DESC,authoredAt DESC,commitId) AS rank FROM candidates)
SELECT flags.summarized,flags.complete,ranked.path,ranked.commitId,ranked.position,commits.title AS message,commits.author_name AS author,commits.authored_at AS updatedAt
FROM (SELECT EXISTS (SELECT 1 FROM directory_last_changes WHERE repository_id=?3 AND commit_id=?2 AND path=?4) AS summarized,NOT EXISTS (SELECT 1 FROM walk WHERE NOT EXISTS (SELECT 1 FROM indexed_commit_changes WHERE repository_id=?3 AND commit_id=walk.id)) AS complete) AS flags
LEFT JOIN ranked ON ranked.rank=1 LEFT JOIN commits ON commits.repository_id=?3 AND commits.id=ranked.commitId`;

export async function directoryLastChanges(
  env: Env,
  execution: ExecutionContext,
  repositoryId: string,
  commitId: string,
  directory: string,
  paths: string[]
): Promise<LastChange[]> {
  if (!paths.length) return [];
  const { results } = await env.DB.prepare(lastChangesSql)
    .bind(JSON.stringify(paths), commitId, repositoryId, directory)
    .all<LastChangeRow>();
  const changes = results.filter((row): row is LastChangeRow & LastChange & { position: number } =>
    Boolean(row.path && row.commitId && row.message !== null)
  );
  const { summarized, complete } = results[0];
  if (!summarized && complete && paths.length <= summarizedEntryLimit)
    execution.waitUntil(summarize(env, repositoryId, commitId, directory, changes));
  return changes.map(({ path, commitId, message, author, updatedAt }) => ({
    path,
    commitId,
    message,
    author,
    updatedAt
  }));
}

function summarize(
  env: Env,
  repositoryId: string,
  commitId: string,
  directory: string,
  changes: Array<LastChange & { position: number }>
) {
  const summary: Summary = Object.fromEntries(
    changes.map((change) => [change.path, [change.commitId, change.position, change.updatedAt]] as const)
  );
  return env.DB.prepare(
    'INSERT OR IGNORE INTO directory_last_changes (repository_id,commit_id,path,changes) VALUES (?,?,?,?)'
  )
    .bind(repositoryId, commitId, directory, JSON.stringify(summary))
    .run();
}
