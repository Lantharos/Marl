import type { Principal } from './auth';
import { json } from './http';
import { inboxPreview } from './inbox';
import type { Env } from './platform';
import { runSelect, summarizeRun } from './runs';
import { repositoryListFilter } from './repository-access';
import { shellData } from './shell';

async function dashboardData(env: Env, principal: Principal) {
  const access = repositoryListFilter(principal);
  const [inbox, runRows] = await Promise.all([
    inboxPreview(env, principal),
    env.DB.prepare(runSelect(`WHERE ${access.sql} ORDER BY runs.created_at DESC,runs.id DESC LIMIT 5`)).bind(...access.values).all<Record<string, unknown>>()
  ]);
  return { inbox, runs: runRows.results.map(summarizeRun) };
}

export async function getDashboard(env: Env, principal: Principal): Promise<Response> {
  const [shell, dashboard] = await Promise.all([
    shellData(env, principal),
    dashboardData(env, principal).catch((error) => {
      console.error('Dashboard data unavailable.', error);
      return null;
    })
  ]);
  return json({ user: principal, ...shell, dashboard });
}
