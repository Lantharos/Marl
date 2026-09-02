import type { Principal } from './auth';
import { problem } from './http';
import type { Env } from './platform';
import { authorizeRepositoryId } from './repository-access';

export async function connectRunRealtime(request: Request, env: Env, principal: Principal | null, jobId: string): Promise<Response> {
  const job = await env.DB.prepare('SELECT runs.repository_id AS repositoryId FROM jobs JOIN runs ON runs.id=jobs.run_id WHERE jobs.id=?').bind(jobId).first<{ repositoryId: string }>();
  const repository = job ? await authorizeRepositoryId(env, principal, job.repositoryId, 'repository.read') : null;
  if (!job || !repository?.role) return problem(404, 'job_not_found', 'Job not found.');
  if (request.headers.get('upgrade') !== 'websocket') return problem(426, 'websocket_required', 'This endpoint requires a WebSocket connection.');
  return env.RUN_ROOMS.get(env.RUN_ROOMS.idFromName(jobId)).fetch(request);
}

export async function publishRunLog(env: Env, jobId: string, sequence: number, body: ReadableStream) {
  const room = env.RUN_ROOMS.get(env.RUN_ROOMS.idFromName(jobId));
  await room.fetch('https://run-room.internal/publish', { method: 'POST', headers: { 'x-marl-log-sequence': String(sequence) }, body });
}
