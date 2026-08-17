import type { Principal } from './auth';
import { problem } from './http';
import type { Env } from './platform';
import { authorizeRepositoryId } from './repository-access';

export async function connectRunRealtime(request: Request, env: Env, principal: Principal, jobId: string): Promise<Response> {
  if (request.headers.get('upgrade') !== 'websocket') return problem(426, 'websocket_required', 'This endpoint requires a WebSocket connection.');
  const job = await env.DB.prepare('SELECT runs.repository_id AS repositoryId FROM jobs JOIN runs ON runs.id=jobs.run_id WHERE jobs.id=?').bind(jobId).first<{ repositoryId: string }>();
  if (!job || !(await authorizeRepositoryId(env, principal, job.repositoryId, 'repository.read'))) return problem(404, 'job_not_found', 'Job not found.');
  return env.RUN_ROOMS.get(env.RUN_ROOMS.idFromName(jobId)).fetch(request);
}

export async function publishRunLog(env: Env, jobId: string, sequence: number, body: ReadableStream) {
  const room = env.RUN_ROOMS.get(env.RUN_ROOMS.idFromName(jobId));
  await room.fetch('https://run-room.internal/publish', { method: 'POST', headers: { 'x-sty-log-sequence': String(sequence) }, body });
}
