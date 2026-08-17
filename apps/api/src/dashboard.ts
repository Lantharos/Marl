import type { Principal } from './auth';
import { json } from './http';
import type { Env } from './platform';
import { pullSelect, summarizePullRows, type PullRow } from './pull-context';
import { runSelect, summarizeRun } from './runs';

type RunnerRow = { id: string; name: string; labelsJson: string; activeJobs: number; concurrency: number; platform: string; architecture: string; version: string; lastSeenAt: string; state: string };

export async function getDashboard(env: Env, principal: Principal): Promise<Response> {
  const [pullRows, runRows, runnerRows] = await Promise.all([
    env.DB.prepare(`${pullSelect} JOIN organization_members ON organization_members.organization_id=repositories.organization_id WHERE organization_members.user_id=? AND pull_requests.state IN ('draft','open') ORDER BY pull_requests.updated_at DESC,pull_requests.id DESC LIMIT 20`).bind(principal.id).all<PullRow>(),
    env.DB.prepare(runSelect(`JOIN organization_members ON organization_members.organization_id=repositories.organization_id WHERE organization_members.user_id=? ORDER BY runs.created_at DESC,runs.id DESC LIMIT 5`)).bind(principal.id).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT runners.id,runners.name,runners.labels_json AS labelsJson,runners.active_jobs AS activeJobs,runners.concurrency,runners.platform,runners.architecture,runners.version,runners.last_seen_at AS lastSeenAt,'offline' AS state FROM runners JOIN organization_members ON organization_members.organization_id=runners.organization_id WHERE organization_members.user_id=? AND (runners.disabled_at IS NOT NULL OR runners.last_seen_at<datetime('now','-90 seconds')) ORDER BY runners.name LIMIT 20`).bind(principal.id).all<RunnerRow>()
  ]);
  const pulls = await summarizePullRows(env, pullRows.results);
  const runners = runnerRows.results.map(({ labelsJson, ...runner }) => ({ ...runner, labels: JSON.parse(labelsJson) }));
  return json({ pulls, runs: runRows.results.map(summarizeRun), runners });
}
