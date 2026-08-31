import type { PullRealtimeUpdate } from '@marl/contracts';
import { identifier } from './domain';
import type { D1PreparedStatement, Env } from './platform';

type UpdatePayload = Record<string, unknown>;

export async function commitPullUpdate(
  env: Env,
  pullId: string,
  kind: string,
  payload: UpdatePayload,
  statements: D1PreparedStatement[]
): Promise<PullRealtimeUpdate> {
  const id = identifier('update');
  const createdAt = new Date().toISOString();
  await env.DB.batch([
    ...statements,
    env.DB.prepare('UPDATE pull_requests SET realtime_version=realtime_version+1 WHERE id=?').bind(pullId),
    env.DB.prepare(`INSERT INTO pull_realtime_updates (id,pull_request_id,version,kind,payload,created_at) SELECT ?,id,realtime_version,?,?,? FROM pull_requests WHERE id=?`).bind(id, kind, JSON.stringify(payload), createdAt, pullId)
  ]);
  const row = await env.DB.prepare('SELECT version FROM pull_realtime_updates WHERE id=?').bind(id).first<{ version: number }>();
  if (!row) throw new Error('Pull request update did not persist.');
  const update = { id, pullId, version: Number(row.version), kind, payload, createdAt };
  try {
    const room = env.PULL_ROOMS.get(env.PULL_ROOMS.idFromName(pullId));
    await room.fetch('https://pull-room.internal/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
  } catch {}
  return update;
}

export async function pullUpdatesAfter(env: Env, pullId: string, version: number, limit = 100): Promise<{ updates: PullRealtimeUpdate[]; hasMore: boolean }> {
  const rows = await env.DB.prepare(`SELECT id,version,kind,payload,created_at AS createdAt FROM pull_realtime_updates WHERE pull_request_id=? AND version>? ORDER BY version LIMIT ?`).bind(pullId, version, limit + 1).all<{ id: string; version: number; kind: string; payload: string; createdAt: string }>();
  const hasMore = rows.results.length > limit;
  const updates = rows.results.slice(0, limit).map((row) => ({
    id: row.id,
    pullId,
    version: Number(row.version),
    kind: row.kind,
    payload: parsePayload(row.payload),
    createdAt: row.createdAt
  }));
  return { updates, hasMore };
}

export async function notifyPullsForCommit(env: Env, repositoryId: string, commitId: string): Promise<void> {
  const pulls = await env.DB.prepare(`SELECT id FROM pull_requests WHERE source_commit_id=? AND state IN ('draft','open') AND (repository_id=? OR COALESCE(source_repository_id,repository_id)=?)`).bind(commitId, repositoryId, repositoryId).all<{ id: string }>();
  await Promise.all(pulls.results.map((pull) => commitPullUpdate(env, pull.id, 'checks.updated', { refreshState: true }, [])));
}

function parsePayload(value: string): UpdatePayload {
  try { return JSON.parse(value) as UpdatePayload; }
  catch { return {}; }
}
