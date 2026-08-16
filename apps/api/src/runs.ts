import type { Principal } from './auth';
import { identifier, validBranchName } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { notifyPullsForCommit } from './pull-realtime';

type Repository = { id: string; organizationId: string; owner: string; name: string };
export type RunStep = { name: string; run: string; shell?: string; environment?: Record<string, string>; workingDirectory?: string; timeoutMinutes?: number; continueOnError?: boolean };
export type RunService = { name: string; image: string; environment: Record<string, string> };
export type RunJob = { key: string; name: string; labels: string[]; needs: string[]; steps: RunStep[]; environment: Record<string, string>; artifacts: string[]; runtime: { image: string; timeoutMinutes: number; services: RunService[] } };
type QueueRun = { repositoryId: string; name: string; trigger: 'manual' | 'retry' | 'push'; branch: string; commitId: string; actorId: string | null; jobs: RunJob[] };
export type JobParseResult = { jobs: RunJob[]; error?: never } | { jobs?: never; error: { code: string; detail: string } };

async function repository(env: Env, principal: Principal, owner: string, name: string): Promise<Repository | null> {
  return env.DB.prepare(`SELECT repositories.id, repositories.organization_id AS organizationId, organizations.slug AS owner, repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=repositories.organization_id WHERE organizations.slug=? COLLATE NOCASE AND repositories.name=? COLLATE NOCASE AND organization_members.user_id=?`).bind(owner, name, principal.id).first<Repository>();
}

function runSelect(where: string) {
  return `SELECT runs.id,runs.number,runs.name,runs.trigger_name AS trigger,runs.branch,runs.commit_id AS commitId,runs.state,runs.created_at AS queuedAt,runs.started_at AS startedAt,runs.completed_at AS completedAt,users.handle AS actor,organizations.slug AS owner,repositories.name AS repository,(SELECT COUNT(*) FROM jobs WHERE jobs.run_id=runs.id) AS jobs FROM runs JOIN repositories ON repositories.id=runs.repository_id JOIN organizations ON organizations.id=repositories.organization_id LEFT JOIN users ON users.id=runs.actor_id ${where}`;
}

function summary(row: Record<string, unknown>) {
  return { id: row.id, number: Number(row.number), repository: { owner: row.owner, name: row.repository }, name: row.name, trigger: row.trigger, actor: row.actor, branch: row.branch, commit: row.commitId, state: row.state, jobs: Number(row.jobs), queuedAt: row.queuedAt, startedAt: row.startedAt, completedAt: row.completedAt };
}

export async function listRuns(env: Env, principal: Principal): Promise<Response> {
  const rows = await env.DB.prepare(runSelect(`JOIN organization_members ON organization_members.organization_id=repositories.organization_id WHERE organization_members.user_id=? ORDER BY runs.created_at DESC LIMIT 100`)).bind(principal.id).all();
  return json({ runs: rows.results.map(summary) });
}

export async function listRepositoryRuns(env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repo = await repository(env, principal, owner, name);
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const rows = await env.DB.prepare(runSelect(`WHERE runs.repository_id=? ORDER BY runs.created_at DESC LIMIT 100`)).bind(repo.id).all();
  return json({ runs: rows.results.map(summary) });
}

export async function createRun(request: Request, env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repo = await repository(env, principal, owner, name);
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request);
  if (!body || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 160 || !validBranchName(body.branch) || !Array.isArray(body.jobs) || body.jobs.length < 1 || body.jobs.length > 32) return problem(422, 'invalid_run', 'A name, branch, and one to 32 jobs are required.');
  const branch = await env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id=? AND name=?').bind(repo.id, body.branch).first<{ commitId: string }>();
  if (!branch) return problem(404, 'branch_not_found', 'Run branch not found.');
  const parsed = parseRunJobs(body.jobs);
  if (parsed.error) return problem(422, parsed.error.code, parsed.error.detail);
  const created = await queueRun(env, { repositoryId: repo.id, name: body.name.trim(), trigger: 'manual', branch: body.branch, commitId: branch.commitId, actorId: principal.id, jobs: parsed.jobs });
  return json({ run: created ? summary(created) : null }, { status: 201 });
}

function environment(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 128 || entries.some(([key, item]) => !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) || typeof item !== 'string' || item.length > 32_000)) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function artifactPath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  return normalized.length > 0 && normalized.length <= 260 && !normalized.startsWith('/') && !normalized.includes(':') && normalized.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function image(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 240 && /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$/.test(normalized) ? normalized : null;
}

export function parseRunJobs(value: unknown): JobParseResult {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return { error: { code: 'invalid_jobs', detail: 'One to 32 jobs are required.' } };
  const jobs: RunJob[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return { error: { code: 'invalid_job', detail: 'Every job must be an object.' } };
    const job = raw as Record<string, unknown>;
    const labels = Array.isArray(job.labels) ? [...new Set(job.labels.map(String).map((label) => label.trim().toLowerCase()))] : [];
    const steps = Array.isArray(job.steps) ? job.steps : [];
    const jobEnvironment = environment(job.environment);
    const runtimeValue = job.runtime && typeof job.runtime === 'object' ? job.runtime as Record<string, unknown> : {};
    const runtimeImage = image(runtimeValue.image ?? job.container ?? 'ubuntu:24.04');
    const timeoutMinutes = Number(runtimeValue.timeoutMinutes ?? job.timeoutMinutes ?? 360);
    const needs = Array.isArray(job.needs) ? [...new Set(job.needs.map(String))] : typeof job.needs === 'string' ? [job.needs] : [];
    const servicesValue = Array.isArray(runtimeValue.services) ? runtimeValue.services : [];
    const services: RunService[] = [];
    for (const value of servicesValue) {
      const service = value && typeof value === 'object' ? value as Record<string, unknown> : null;
      const serviceEnvironment = environment(service?.environment);
      const serviceImage = image(service?.image);
      if (!service || typeof service.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(service.name) || !serviceImage || !serviceEnvironment) return { error: { code: 'invalid_service', detail: 'Services need a valid name, container image, and environment.' } };
      services.push({ name: service.name, image: serviceImage, environment: serviceEnvironment });
    }
    if (typeof job.key !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(job.key) || typeof job.name !== 'string' || !job.name.trim() || job.name.length > 160 || labels.length > 32 || labels.some((label) => !/^[a-z0-9][a-z0-9._-]{0,39}$/.test(label)) || needs.length > 31 || needs.some((need) => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(need)) || steps.length < 1 || steps.length > 64 || !jobEnvironment || !runtimeImage || !Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 1440 || services.length > 8) return { error: { code: 'invalid_job', detail: 'Job keys, names, labels, dependencies, environment, runtime, and steps are invalid.' } };
    const parsedSteps: RunJob['steps'] = [];
    for (const rawStep of steps) {
      const step = rawStep as Record<string, unknown>;
      const stepEnvironment = environment(step?.environment);
      const stepTimeout = step.timeoutMinutes === undefined ? undefined : Number(step.timeoutMinutes);
      const workingDirectory = step.workingDirectory === undefined ? undefined : String(step.workingDirectory);
      if (!step || typeof step.name !== 'string' || !step.name.trim() || step.name.length > 160 || typeof step.run !== 'string' || !step.run.trim() || step.run.length > 50_000 || (step.shell !== undefined && (typeof step.shell !== 'string' || !['powershell', 'pwsh', 'cmd', 'sh', 'bash'].includes(step.shell))) || !stepEnvironment || (stepTimeout !== undefined && (!Number.isInteger(stepTimeout) || stepTimeout < 1 || stepTimeout > 1440)) || (workingDirectory !== undefined && !artifactPath(workingDirectory))) return { error: { code: 'invalid_step', detail: 'Every step needs a valid name, command, shell, environment, working directory, and timeout.' } };
      parsedSteps.push({ name: step.name, run: step.run, ...(typeof step.shell === 'string' ? { shell: step.shell } : {}), ...(Object.keys(stepEnvironment).length ? { environment: stepEnvironment } : {}), ...(workingDirectory ? { workingDirectory } : {}), ...(stepTimeout ? { timeoutMinutes: stepTimeout } : {}), ...(step.continueOnError === true ? { continueOnError: true } : {}) });
    }
    const artifacts = Array.isArray(job.artifacts) ? job.artifacts.map(String) : [];
    if (artifacts.length > 32 || artifacts.some((path) => !artifactPath(path))) return { error: { code: 'invalid_artifacts', detail: 'Artifact paths must stay inside the job workspace.' } };
    jobs.push({ key: job.key, name: job.name, labels, needs, steps: parsedSteps, environment: jobEnvironment, artifacts, runtime: { image: runtimeImage, timeoutMinutes, services } });
  }
  if (new Set(jobs.map((job) => job.key)).size !== jobs.length) return { error: { code: 'duplicate_job', detail: 'Job keys must be unique.' } };
  if (jobs.some((job) => job.needs.includes(job.key) || job.needs.some((need) => !jobs.some((candidate) => candidate.key === need)))) return { error: { code: 'invalid_dependency', detail: 'Every job dependency must refer to another job in this run.' } };
  const resolved = new Set<string>();
  while (resolved.size < jobs.length) {
    const ready = jobs.filter((job) => !resolved.has(job.key) && job.needs.every((need) => resolved.has(need)));
    if (!ready.length) return { error: { code: 'dependency_cycle', detail: 'Job dependencies cannot contain a cycle.' } };
    for (const job of ready) resolved.add(job.key);
  }
  return { jobs };
}

export async function queueRun(env: Env, input: QueueRun): Promise<Record<string, unknown> | null> {
  const runId = identifier('run');
  const statements = [env.DB.prepare(`INSERT INTO runs (id,repository_id,number,name,trigger_name,branch,commit_id,actor_id) SELECT ?,?,COALESCE(MAX(number),0)+1,?,?,?,?,? FROM runs WHERE repository_id=?`).bind(runId, input.repositoryId, input.name, input.trigger, input.branch, input.commitId, input.actorId, input.repositoryId)];
  for (const job of input.jobs) {
    const checkName = `${input.name} / ${job.name}`.slice(0, 240);
    statements.push(env.DB.prepare(`INSERT INTO jobs (id,run_id,job_key,name,check_name,required_labels_json,steps_json,environment_json,artifact_paths_json,runtime_json,needs_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(identifier('job'), runId, job.key, job.name, checkName, JSON.stringify(job.labels), JSON.stringify(job.steps), JSON.stringify(job.environment), JSON.stringify(job.artifacts), JSON.stringify(job.runtime), JSON.stringify(job.needs)));
    statements.push(env.DB.prepare(`INSERT INTO checks (id,repository_id,commit_id,name,state,summary) VALUES (?,?,?,?,?,'Waiting for a self-hosted runner.') ON CONFLICT(repository_id,commit_id,name) DO UPDATE SET state='queued',summary=excluded.summary,started_at=NULL,completed_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(identifier('check'), input.repositoryId, input.commitId, checkName, 'queued'));
  }
  await env.DB.batch(statements);
  await notifyPullsForCommit(env, input.repositoryId, input.commitId);
  return env.DB.prepare(runSelect('WHERE runs.id=?')).bind(runId).first<Record<string, unknown>>();
}

export async function getRun(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repo = await repository(env, principal, owner, name);
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const run = await env.DB.prepare(runSelect('WHERE runs.repository_id=? AND runs.number=?')).bind(repo.id, number).first<Record<string, unknown>>();
  if (!run) return problem(404, 'run_not_found', 'Run not found.');
  const [jobs, artifacts] = await Promise.all([
    env.DB.prepare(`SELECT jobs.id,jobs.job_key AS key,jobs.name,jobs.state,jobs.required_labels_json AS labelsJson,jobs.attempt,jobs.exit_code AS exitCode,jobs.started_at AS startedAt,jobs.completed_at AS completedAt,runners.id AS runnerId,runners.name AS runnerName,COALESCE((SELECT SUM(byte_size) FROM job_log_chunks WHERE job_id=jobs.id),0) AS logBytes FROM jobs LEFT JOIN runners ON runners.id=jobs.runner_id WHERE jobs.run_id=? ORDER BY jobs.created_at`).bind(run.id).all<{ id: string; key: string; name: string; state: string; labelsJson: string; attempt: number; exitCode?: number; startedAt?: string; completedAt?: string; runnerId?: string; runnerName?: string; logBytes: number }>(),
    env.DB.prepare(`SELECT artifacts.id,artifacts.job_id AS jobId,artifacts.name,artifacts.byte_size AS byteSize,artifacts.content_type AS contentType FROM artifacts JOIN jobs ON jobs.id=artifacts.job_id WHERE jobs.run_id=? ORDER BY artifacts.created_at`).bind(run.id).all<{ id: string; jobId: string; name: string; byteSize: number; contentType: string }>()
  ]);
  return json({ run: { ...summary(run), jobsDetail: jobs.results.map(({ labelsJson, runnerId, runnerName, ...job }) => ({ ...job, requiredLabels: JSON.parse(labelsJson), ...(runnerId ? { runner: { id: runnerId, name: runnerName } } : {}), artifacts: artifacts.results.filter((artifact) => artifact.jobId === job.id).map(({ jobId: _, ...artifact }) => artifact) })) } });
}

export async function getRunState(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repo = await repository(env, principal, owner, name);
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const run = await env.DB.prepare(runSelect('WHERE runs.repository_id=? AND runs.number=?')).bind(repo.id, number).first<Record<string, unknown>>();
  if (!run) return problem(404, 'run_not_found', 'Run not found.');
  const runSummary = summary(run);
  const jobs = await env.DB.prepare(`SELECT jobs.id,jobs.state,jobs.attempt,jobs.exit_code AS exitCode,jobs.started_at AS startedAt,jobs.completed_at AS completedAt,runners.id AS runnerId,runners.name AS runnerName,COALESCE((SELECT SUM(byte_size) FROM job_log_chunks WHERE job_id=jobs.id),0) AS logBytes FROM jobs LEFT JOIN runners ON runners.id=jobs.runner_id WHERE jobs.run_id=? ORDER BY jobs.created_at`).bind(run.id).all<{ id: string; state: string; runnerId?: string; runnerName?: string }>();
  const artifacts = ['queued', 'running'].includes(String(runSummary.state))
    ? { results: [] as Array<{ id: string; jobId: string; name: string; byteSize: number; contentType: string }> }
    : await env.DB.prepare(`SELECT artifacts.id,artifacts.job_id AS jobId,artifacts.name,artifacts.byte_size AS byteSize,artifacts.content_type AS contentType FROM artifacts JOIN jobs ON jobs.id=artifacts.job_id WHERE jobs.run_id=? ORDER BY artifacts.created_at`).bind(run.id).all<{ id: string; jobId: string; name: string; byteSize: number; contentType: string }>();
  return json({ run: runSummary, jobs: jobs.results.map(({ runnerId, runnerName, ...job }) => ({ ...job, ...(runnerId ? { runner: { id: runnerId, name: runnerName } } : {}), ...(!['queued', 'running'].includes(String(runSummary.state)) ? { artifacts: artifacts.results.filter((artifact) => artifact.jobId === job.id).map(({ jobId: _, ...artifact }) => artifact) } : {}) })) });
}

export async function cancelRun(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repo = await repository(env, principal, owner, name);
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const run = await env.DB.prepare(`SELECT id,state,commit_id AS commitId FROM runs WHERE repository_id=? AND number=?`).bind(repo.id, number).first<{ id: string; state: string; commitId: string }>();
  if (!run || !['queued', 'running'].includes(run.state)) return problem(409, 'run_not_active', 'Only queued or running runs can be canceled.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE jobs SET state='canceled',completed_at=CURRENT_TIMESTAMP WHERE run_id=? AND state='queued'`).bind(run.id),
    env.DB.prepare(`UPDATE jobs SET cancel_requested=1 WHERE run_id=? AND state='running'`).bind(run.id),
    env.DB.prepare(`UPDATE checks SET state='canceled',summary='Canceled by a developer.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND commit_id=(SELECT commit_id FROM runs WHERE id=?) AND name IN (SELECT check_name FROM jobs WHERE run_id=?)`).bind(repo.id, run.id, run.id),
    env.DB.prepare(`UPDATE runs SET state='canceled',completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(run.id)
  ]);
  await notifyPullsForCommit(env, repo.id, run.commitId);
  return json({ canceled: true, state: 'canceled' });
}

export async function retryRun(env: Env, principal: Principal, owner: string, name: string, number: number): Promise<Response> {
  const repo = await repository(env, principal, owner, name);
  if (!repo) return problem(404, 'repository_not_found', 'Repository not found.');
  const previous = await env.DB.prepare(`SELECT id,name,branch,commit_id AS commitId FROM runs WHERE repository_id=? AND number=? AND state IN ('success','failure','canceled')`).bind(repo.id, number).first<{ id: string; name: string; branch: string; commitId: string }>();
  if (!previous) return problem(409, 'run_not_retryable', 'This run cannot be retried yet.');
  const jobs = await env.DB.prepare(`SELECT job_key AS jobKey,name,check_name AS checkName,required_labels_json AS labelsJson,steps_json AS stepsJson,environment_json AS environmentJson,artifact_paths_json AS artifactPathsJson,runtime_json AS runtimeJson,needs_json AS needsJson FROM jobs WHERE run_id=? ORDER BY created_at`).bind(previous.id).all<{ jobKey: string; name: string; checkName: string; labelsJson: string; stepsJson: string; environmentJson: string; artifactPathsJson: string; runtimeJson: string; needsJson: string }>();
  const id = identifier('run');
  const statements = [env.DB.prepare(`INSERT INTO runs (id,repository_id,number,name,trigger_name,branch,commit_id,actor_id) SELECT ?,?,COALESCE(MAX(number),0)+1,?,'retry',?,?,? FROM runs WHERE repository_id=?`).bind(id, repo.id, previous.name, previous.branch, previous.commitId, principal.id, repo.id)];
  for (const job of jobs.results) {
    statements.push(env.DB.prepare(`INSERT INTO jobs (id,run_id,job_key,name,check_name,required_labels_json,steps_json,environment_json,artifact_paths_json,runtime_json,needs_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(identifier('job'), id, job.jobKey, job.name, job.checkName, job.labelsJson, job.stepsJson, job.environmentJson, job.artifactPathsJson, job.runtimeJson, job.needsJson));
    statements.push(env.DB.prepare(`INSERT INTO checks (id,repository_id,commit_id,name,state,summary) VALUES (?,?,?,?,?,'Waiting for a self-hosted runner.') ON CONFLICT(repository_id,commit_id,name) DO UPDATE SET state='queued',summary=excluded.summary,started_at=NULL,completed_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(identifier('check'), repo.id, previous.commitId, job.checkName, 'queued'));
  }
  await env.DB.batch(statements);
  await notifyPullsForCommit(env, repo.id, previous.commitId);
  const created = await env.DB.prepare(runSelect('WHERE runs.id=?')).bind(id).first();
  return json({ run: created ? summary(created) : null }, { status: 201 });
}

export async function readJobLogs(env: Env, principal: Principal, jobId: string, url: URL): Promise<Response> {
  const allowed = await env.DB.prepare(`SELECT jobs.id FROM jobs JOIN runs ON runs.id=jobs.run_id JOIN repositories ON repositories.id=runs.repository_id JOIN organization_members ON organization_members.organization_id=repositories.organization_id WHERE jobs.id=? AND organization_members.user_id=?`).bind(jobId, principal.id).first();
  if (!allowed) return problem(404, 'job_not_found', 'Job not found.');
  const after = Number(url.searchParams.get('after') ?? -1);
  if (!Number.isSafeInteger(after) || after < -1) return problem(422, 'invalid_log_cursor', 'Log cursor is invalid.');
  const chunks = await env.DB.prepare('SELECT sequence,object_key AS objectKey FROM job_log_chunks WHERE job_id=? AND sequence>? ORDER BY sequence').bind(jobId, after).all<{ sequence: number; objectKey: string }>();
  const streams = [];
  for (const chunk of chunks.results) { const object = await env.OBJECTS.get(chunk.objectKey); if (object) streams.push(await new Response(object.body).text()); }
  const cursor = chunks.results.at(-1)?.sequence ?? after;
  return new Response(streams.join(''), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-sty-log-cursor': String(cursor) } });
}

export async function downloadArtifact(env: Env, principal: Principal, artifactId: string): Promise<Response> {
  const artifact = await env.DB.prepare(`SELECT artifacts.name,artifacts.object_key AS objectKey,artifacts.content_type AS contentType FROM artifacts JOIN jobs ON jobs.id=artifacts.job_id JOIN runs ON runs.id=jobs.run_id JOIN repositories ON repositories.id=runs.repository_id JOIN organization_members ON organization_members.organization_id=repositories.organization_id WHERE artifacts.id=? AND organization_members.user_id=?`).bind(artifactId, principal.id).first<{ name: string; objectKey: string; contentType: string }>();
  if (!artifact) return problem(404, 'artifact_not_found', 'Artifact not found.');
  const object = await env.OBJECTS.get(artifact.objectKey);
  if (!object) return problem(502, 'artifact_missing', 'Artifact bytes are missing.');
  return new Response(object.body, { headers: { 'content-type': artifact.contentType, 'content-disposition': `attachment; filename="${artifact.name.replaceAll('"', '')}"`, 'content-length': String(object.size) } });
}
