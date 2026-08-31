import type { Principal } from './auth';
import { json } from './http';
import { inboxPreview } from './inbox';
import type { Env } from './platform';
import { runSelect, summarizeRun } from './runs';
import { repositoryListFilter } from './repository-access';

export async function getDashboard(env: Env, principal: Principal): Promise<Response> {
  const access = repositoryListFilter(principal);
  const [inbox, runRows] = await Promise.all([
    inboxPreview(env, principal),
    env.DB.prepare(runSelect(`WHERE ${access.sql} ORDER BY runs.created_at DESC,runs.id DESC LIMIT 5`)).bind(...access.values).all<Record<string, unknown>>()
  ]);
  return json({ inbox, runs: runRows.results.map(summarizeRun) });
}
