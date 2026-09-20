import { json } from './http';
import type { Env } from './platform';

export async function readiness(env: Env) {
  const checks = await Promise.allSettled([
    env.DB.prepare('SELECT 1 AS ready').first(),
    env.OBJECTS.list({ limit: 1 }),
  ]);
  const ready = checks.every(check => check.status === 'fulfilled');
  return json({ service: 'marl-api', status: ready ? 'ready' : 'unavailable', database: checks[0].status === 'fulfilled', objects: checks[1].status === 'fulfilled' }, { status: ready ? 200 : 503 });
}
