import { parse } from 'yaml';
import { principalHasScope, type Principal } from './auth';
import { auditStatement } from './audit';
import { identifier } from './domain';
import { pageResult, pageSize, readCursor } from './cursor';
import { requestGitGateway } from './git-gateway';
import { json, problem } from './http';
import type { Env } from './platform';
import { parseRunJobs, queueRun, runSelect, summarizeRun, type RunJob } from './runs';
import { authorizeRepository } from './repository-access';

type WorkflowEntry = { path: string; objectId: string };
type WorkflowWarning = { path: string; error: string };
type ObjectValue = Record<string, unknown>;
type WorkflowTrigger = 'push' | 'workflow_dispatch' | 'pull_request' | 'schedule';
type IndexedWorkflow = {
  id: string;
  path: string;
  name: string;
  source: 'marl' | 'github';
  triggers: WorkflowTrigger[];
  jobs: RunJob[] | null;
  error: string | null;
  pushEnabled: boolean;
  supersedePushes: boolean;
};

const knownTriggers = new Set<WorkflowTrigger>(['push', 'workflow_dispatch', 'pull_request', 'schedule']);
const executableTriggers = new Set<WorkflowTrigger>(['push', 'workflow_dispatch']);

function declaredTriggers(value: unknown): WorkflowTrigger[] {
  const names = typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : value && typeof value === 'object'
        ? Object.keys(value)
        : [];
  return [...new Set(names.filter((name): name is WorkflowTrigger => knownTriggers.has(name as WorkflowTrigger)))];
}

function workflowName(value: ObjectValue | null, path: string): string {
  if (typeof value?.name === 'string' && value.name.trim().length >= 2 && value.name.trim().length <= 160) return value.name.trim();
  return path.split('/').at(-1)?.replace(/\.ya?ml$/i, '').replaceAll('-', ' ') || 'Workflow';
}

export function supersedePushes(value: ObjectValue | null): boolean {
  if (typeof value?.supersede === 'boolean') return value.supersede;
  const concurrency = value?.concurrency;
  if (concurrency && typeof concurrency === 'object' && !Array.isArray(concurrency)) {
    const cancelInProgress = (concurrency as ObjectValue)['cancel-in-progress'];
    if (typeof cancelInProgress === 'boolean') return cancelInProgress;
  }
  return true;
}

function branchMatches(patterns: unknown, branch: string): boolean {
  if (patterns === undefined) return true;
  const values = typeof patterns === 'string' ? [patterns] : patterns;
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) return false;
  return values.some((pattern: string) => {
    const expression = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(branch);
  });
}

function runsOnPush(value: unknown, branch: string): boolean {
  if (value === 'push') return true;
  if (Array.isArray(value)) return value.includes('push');
  if (!value || typeof value !== 'object') return false;
  const push = (value as ObjectValue).push;
  if (push === null || push === true) return true;
  return Boolean(push && typeof push === 'object' && branchMatches((push as ObjectValue).branches, branch));
}

function workflowJobs(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).map(([key, raw]) => raw && typeof raw === 'object' ? { key, name: key, ...(raw as ObjectValue) } : raw);
}

function stringEnvironment(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}

function matrixRows(value: unknown): Array<Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{}];
  const axes = Object.entries(value as ObjectValue).filter(([key]) => !['include', 'exclude'].includes(key));
  let rows: Array<Record<string, string>> = [{}];
  for (const [key, raw] of axes) {
    if (!Array.isArray(raw) || !raw.length) return [];
    rows = rows.flatMap((row) => raw.map((item) => ({ ...row, [key]: String(item) })));
  }
  const excluded = Array.isArray((value as ObjectValue).exclude) ? (value as ObjectValue).exclude as ObjectValue[] : [];
  rows = rows.filter((row) => !excluded.some((entry) => Object.entries(entry).every(([key, item]) => row[key] === String(item))));
  const included = Array.isArray((value as ObjectValue).include) ? (value as ObjectValue).include as ObjectValue[] : [];
  return [...rows, ...included.map((entry) => Object.fromEntries(Object.entries(entry).map(([key, item]) => [key, String(item)])))];
}

function interpolate(value: string, matrix: Record<string, string>): string {
  return value.replace(/\$\{\{\s*matrix\.([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) => matrix[key] ?? '');
}

function githubRuntime(job: ObjectValue, matrix: Record<string, string>) {
  const runsOn = (typeof job['runs-on'] === 'string' ? [job['runs-on']] : Array.isArray(job['runs-on']) ? job['runs-on'].map(String) : []).map((label) => interpolate(label, matrix));
  if (!runsOn.length) throw new Error('Every GitHub Actions job needs runs-on.');
  if (runsOn.some((label) => /^(windows|macos)-/.test(label))) throw new Error('Windows and macOS hosted images are not available on Docker runners.');
  const labels = runsOn.some((label) => /^ubuntu-/.test(label)) ? ['docker'] : runsOn.filter((label) => label !== 'self-hosted');
  if (!labels.includes('docker')) labels.push('docker');
  const container = job.container;
  const image = interpolate(typeof container === 'string' ? container : container && typeof container === 'object' ? String((container as ObjectValue).image ?? '') : 'ubuntu:24.04', matrix);
  const services = Object.entries(job.services && typeof job.services === 'object' ? job.services as ObjectValue : {}).map(([name, raw]) => {
    const service = typeof raw === 'string' ? { image: raw } : raw as ObjectValue;
    return { name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'), image: interpolate(String(service.image ?? ''), matrix), environment: stringEnvironment(service.env) };
  });
  return { labels, runtime: { image, timeoutMinutes: Number(job['timeout-minutes'] ?? 360), services } };
}

function githubSteps(job: ObjectValue, matrix: Record<string, string>) {
  const steps: Array<Record<string, unknown>> = [];
  const artifacts: string[] = [];
  for (const [index, raw] of (Array.isArray(job.steps) ? job.steps : []).entries()) {
    if (!raw || typeof raw !== 'object') throw new Error('Every GitHub Actions step must be an object.');
    const step = raw as ObjectValue;
    if (typeof step.uses === 'string') {
      const action = step.uses.toLowerCase();
      if (action.startsWith('actions/checkout@')) continue;
      if (action.startsWith('actions/upload-artifact@')) {
        const path = step.with && typeof step.with === 'object' ? String((step.with as ObjectValue).path ?? '') : '';
        artifacts.push(...path.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
        continue;
      }
      throw new Error(`Action ${step.uses} is not supported yet. Use a run step or a supported Marl action.`);
    }
    if (typeof step.run !== 'string') throw new Error('Every GitHub Actions step needs run or uses.');
    const run = interpolate(step.run, matrix).replaceAll('${{ github.sha }}', '$MARL_COMMIT').replaceAll('${{ github.ref_name }}', '$MARL_BRANCH');
    if (run.includes('${{')) throw new Error(`Step ${step.name ?? index + 1} uses an expression Marl cannot evaluate yet.`);
    const shell = typeof step.shell === 'string' ? step.shell.split(/[ {]/)[0] : 'bash';
    steps.push({ name: String(step.name ?? `Step ${index + 1}`), run, shell, environment: stringEnvironment(step.env), ...(typeof step['working-directory'] === 'string' ? { workingDirectory: interpolate(step['working-directory'], matrix) } : {}), ...(step['timeout-minutes'] !== undefined ? { timeoutMinutes: Number(step['timeout-minutes']) } : {}), ...(step['continue-on-error'] === true ? { continueOnError: true } : {}) });
  }
  if (!steps.length) steps.push({ name: 'Finalize', run: 'printf "Workflow has no executable steps.\\n"', shell: 'sh' });
  return { steps, artifacts };
}

function githubJobs(value: unknown, globalEnvironment: Record<string, string>): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const jobs: Array<Record<string, unknown>> = [];
  for (const [baseKey, raw] of Object.entries(value as ObjectValue)) {
    if (!raw || typeof raw !== 'object') throw new Error(`Job ${baseKey} is invalid.`);
    const job = raw as ObjectValue;
    const rows = matrixRows(job.strategy && typeof job.strategy === 'object' ? (job.strategy as ObjectValue).matrix : undefined);
    if (!rows.length) throw new Error(`Job ${baseKey} has an empty matrix.`);
    for (const [index, matrix] of rows.entries()) {
      const suffix = rows.length === 1 ? '' : `_${index + 1}`;
      const key = `${baseKey}${suffix}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 64);
      const runtime = githubRuntime(job, matrix);
      const translated = githubSteps(job, matrix);
      const matrixLabel = Object.values(matrix).join(', ');
      const rawNeeds = typeof job.needs === 'string' ? [job.needs] : Array.isArray(job.needs) ? job.needs.map(String) : [];
      const containerEnvironment = job.container && typeof job.container === 'object' ? stringEnvironment((job.container as ObjectValue).env) : {};
      jobs.push({ key, name: interpolate(String(job.name ?? baseKey), matrix) + (matrixLabel ? ` (${matrixLabel})` : ''), labels: runtime.labels, needs: rawNeeds.map((need) => need.toLowerCase().replace(/[^a-z0-9_-]/g, '-')), steps: translated.steps, environment: { ...globalEnvironment, ...stringEnvironment(job.env), ...containerEnvironment, ...Object.fromEntries(Object.entries(matrix).map(([name, item]) => [`MATRIX_${name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`, item])) }, artifacts: translated.artifacts, runtime: runtime.runtime });
    }
  }
  if (jobs.length > 32) throw new Error('Matrix expansion produced more than 32 jobs.');
  const keys = jobs.map((job) => String(job.key));
  for (const job of jobs) {
    job.needs = (job.needs as string[]).flatMap((need) => keys.filter((key) => key === need || key.startsWith(`${need}_`)));
  }
  return jobs;
}

export function parseWorkflow(value: ObjectValue, path: string): { jobs: RunJob[]; error?: never } | { jobs?: never; error: string } {
  try {
    const source = path.startsWith('.github/workflows/') ? githubJobs(value.jobs, stringEnvironment(value.env)) : workflowJobs(value.jobs);
    const parsed = parseRunJobs(source);
    return parsed.error ? { error: parsed.error.detail } : { jobs: parsed.jobs };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Workflow is invalid.' };
  }
}

export async function queuePushWorkflows(env: Env, repositoryId: string, branch: string, commitId: string, treeId: string, actorId: string | null, queuePush = true): Promise<{ queued: number; warnings: WorkflowWarning[] }> {
  const repository = await env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=?`).bind(repositoryId).first<{ owner: string; name: string }>();
  if (!repository) return { queued: 0, warnings: [{ path: '', error: 'Repository metadata is missing.' }] };
  const entries = await env.DB.prepare(`SELECT path,object_id AS objectId FROM repository_entries WHERE repository_id=? AND tree_id=? AND kind='blob' AND (path LIKE '.marl/workflows/%.yml' OR path LIKE '.marl/workflows/%.yaml' OR path LIKE '.github/workflows/%.yml' OR path LIKE '.github/workflows/%.yaml') ORDER BY path LIMIT 100`).bind(repositoryId, treeId).all<WorkflowEntry>();
  const existing = await env.DB.prepare('SELECT id,path FROM workflows WHERE repository_id=? AND branch=?').bind(repositoryId, branch).all<{ id: string; path: string }>();
  const existingIds = new Map(existing.results.map((workflow) => [workflow.path, workflow.id]));
  const warnings: WorkflowWarning[] = [];
  const indexed: IndexedWorkflow[] = [];
  let queued = 0;
  for (let offset = 0; offset < entries.results.length; offset += 8) {
    const batch = await Promise.all(entries.results.slice(offset, offset + 8).map(async (entry) => ({
      entry,
      object: await requestGitGateway(env, '/_marl/blob', { owner: repository.owner, repository: repository.name, objectId: entry.objectId }, { attempts: 2 })
    })));
    for (const { entry, object } of batch) {
      const size = Number(object.headers.get('content-length'));
      if (!object.ok || !Number.isSafeInteger(size) || size > 1024 * 1024) {
        const error = 'Workflow file is missing or larger than 1 MiB.';
        warnings.push({ path: entry.path, error });
        indexed.push({ id: existingIds.get(entry.path) ?? identifier('workflow'), path: entry.path, name: workflowName(null, entry.path), source: entry.path.startsWith('.github/') ? 'github' : 'marl', triggers: [], jobs: null, error, pushEnabled: false, supersedePushes: true });
        continue;
      }
      try {
        const value = parse(await object.text(), { maxAliasCount: 10 }) as ObjectValue | null;
        const triggers = declaredTriggers(value?.on);
        const parsed = value ? parseWorkflow(value, entry.path) : { error: 'Workflow YAML must contain an object.' };
        const unsupported = triggers.filter((trigger) => !executableTriggers.has(trigger));
        const error = !triggers.length
          ? 'Workflow must declare push or workflow_dispatch.'
          : unsupported.length
            ? `${unsupported.join(', ')} ${unsupported.length === 1 ? 'is' : 'are'} not supported yet.`
            : parsed.error ?? null;
        if (error) warnings.push({ path: entry.path, error });
        indexed.push({ id: existingIds.get(entry.path) ?? identifier('workflow'), path: entry.path, name: workflowName(value, entry.path), source: entry.path.startsWith('.github/') ? 'github' : 'marl', triggers, jobs: parsed.jobs ?? null, error, pushEnabled: runsOnPush(value?.on, branch), supersedePushes: supersedePushes(value) });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 240) : 'Workflow YAML is invalid.';
        warnings.push({ path: entry.path, error: message });
        indexed.push({ id: existingIds.get(entry.path) ?? identifier('workflow'), path: entry.path, name: workflowName(null, entry.path), source: entry.path.startsWith('.github/') ? 'github' : 'marl', triggers: [], jobs: null, error: message, pushEnabled: false, supersedePushes: true });
      }
    }
  }
  const statements = [env.DB.prepare('UPDATE workflows SET active=0,updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND branch=?').bind(repositoryId, branch)];
  for (const workflow of indexed) {
    statements.push(env.DB.prepare(`INSERT INTO workflows (id,repository_id,branch,path,name,source,triggers_json,jobs_json,status,error,commit_id,supersede_pushes,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(repository_id,branch,path) DO UPDATE SET name=excluded.name,source=excluded.source,triggers_json=excluded.triggers_json,jobs_json=excluded.jobs_json,status=excluded.status,error=excluded.error,commit_id=excluded.commit_id,supersede_pushes=excluded.supersede_pushes,active=1,updated_at=CURRENT_TIMESTAMP`).bind(workflow.id, repositoryId, branch, workflow.path, workflow.name, workflow.source, JSON.stringify(workflow.triggers), workflow.jobs ? JSON.stringify(workflow.jobs) : null, workflow.error ? 'invalid' : 'valid', workflow.error, commitId, workflow.supersedePushes ? 1 : 0));
  }
  await env.DB.batch(statements);
  for (const workflow of indexed) {
    if (!queuePush || workflow.error || !workflow.jobs || !workflow.pushEnabled) continue;
    await queueRun(env, { repositoryId, workflowId: workflow.id, name: workflow.name, trigger: 'push', branch, commitId, actorId, jobs: workflow.jobs, supersede: workflow.supersedePushes });
    queued += 1;
  }
  return { queued, warnings };
}

type WorkflowRow = Record<string, unknown> & { id: string; triggersJson: string; jobsJson: string | null; runCount: number; lastRunId: string | null; active: number };

function workflowSummary(row: WorkflowRow, lastRun?: Record<string, unknown> | null) {
  const jobs = row.jobsJson ? JSON.parse(row.jobsJson) as unknown[] : [];
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    source: row.source,
    branch: row.branch,
    commit: row.commitId,
    triggers: JSON.parse(row.triggersJson),
    status: row.status,
    active: Boolean(row.active),
    ...(row.error ? { error: row.error } : {}),
    jobs: jobs.length,
    runCount: Number(row.runCount),
    ...(lastRun ? { lastRun: summarizeRun(lastRun) } : {}),
    updatedAt: row.updatedAt
  };
}

async function workflowRows(env: Env, repositoryId: string, workflowId?: string): Promise<WorkflowRow[]> {
  const where = workflowId ? 'workflows.repository_id=? AND workflows.id=?' : 'workflows.repository_id=? AND workflows.branch=repositories.default_branch AND workflows.active=1';
  const values = workflowId ? [repositoryId, workflowId] : [repositoryId];
  const rows = await env.DB.prepare(`SELECT workflows.id,workflows.name,workflows.path,workflows.source,workflows.branch,workflows.commit_id AS commitId,workflows.triggers_json AS triggersJson,workflows.jobs_json AS jobsJson,workflows.status,workflows.error,workflows.active,workflows.updated_at AS updatedAt,(SELECT COUNT(*) FROM runs WHERE runs.workflow_id=workflows.id) AS runCount,(SELECT id FROM runs WHERE runs.workflow_id=workflows.id ORDER BY created_at DESC LIMIT 1) AS lastRunId FROM workflows JOIN repositories ON repositories.id=workflows.repository_id WHERE ${where} ORDER BY workflows.name`).bind(...values).all<WorkflowRow>();
  return rows.results;
}

export async function listWorkflows(env: Env, principal: Principal, owner: string, name: string): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const rows = await workflowRows(env, repository.id);
  const lastRunIds = rows.map((row) => row.lastRunId).filter((id): id is string => typeof id === 'string');
  const lastRuns = new Map<string, Record<string, unknown>>();
  if (lastRunIds.length) {
    const placeholders = lastRunIds.map(() => '?').join(',');
    const runs = await env.DB.prepare(runSelect(`WHERE runs.id IN (${placeholders})`)).bind(...lastRunIds).all<Record<string, unknown>>();
    for (const run of runs.results) lastRuns.set(String(run.id), run);
  }
  return json({ workflows: rows.map((row) => workflowSummary(row, row.lastRunId ? lastRuns.get(row.lastRunId) : null)) });
}

export async function getWorkflow(env: Env, principal: Principal, owner: string, name: string, workflowId: string, url: URL): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const workflow = (await workflowRows(env, repository.id, workflowId))[0];
  if (!workflow) return problem(404, 'workflow_not_found', 'Workflow not found.');
  const limit = pageSize(url);
  const cursor = readCursor(url);
  const after = cursor ? 'AND (runs.created_at<? OR (runs.created_at=? AND runs.id<?))' : '';
  const values = cursor ? [repository.id, workflow.id, cursor.value, cursor.value, cursor.id, limit + 1] : [repository.id, workflow.id, limit + 1];
  const runs = await env.DB.prepare(runSelect(`WHERE runs.repository_id=? AND runs.workflow_id=? ${after} ORDER BY runs.created_at DESC,runs.id DESC LIMIT ?`)).bind(...values).all<Record<string, unknown>>();
  const page = pageResult(runs.results, limit, (row) => ({ value: String(row.queuedAt), id: String(row.id) }));
  return json({ workflow: { ...workflowSummary(workflow, page.items[0]), runs: page.items.map(summarizeRun) }, nextCursor: page.nextCursor });
}

export async function dispatchWorkflow(env: Env, principal: Principal, owner: string, name: string, workflowId: string): Promise<Response> {
  if (!principalHasScope(principal, 'workflow:dispatch')) return problem(403, 'token_scope_required', 'This token cannot dispatch workflows.');
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.push');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const workflow = (await workflowRows(env, repository.id, workflowId))[0];
  if (!workflow || !workflow.active || workflow.status !== 'valid' || !workflow.jobsJson) return problem(409, 'workflow_not_runnable', 'This workflow is not runnable.');
  const triggers = JSON.parse(workflow.triggersJson) as WorkflowTrigger[];
  if (!triggers.includes('workflow_dispatch')) return problem(409, 'workflow_not_manual', 'This workflow does not declare workflow_dispatch.');
  const branch = await env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id=? AND name=?').bind(repository.id, workflow.branch).first<{ commitId: string }>();
  if (!branch || branch.commitId !== workflow.commitId) return problem(409, 'workflow_catalog_stale', 'The workflow catalog is updating. Try again after the latest push is indexed.');
  const parsed = parseRunJobs(JSON.parse(workflow.jobsJson));
  if (parsed.error) return problem(409, parsed.error.code, parsed.error.detail);
  const created = await queueRun(env, { repositoryId: repository.id, workflowId: workflow.id, name: String(workflow.name), trigger: 'workflow_dispatch', branch: String(workflow.branch), commitId: String(workflow.commitId), actorId: principal.id, jobs: parsed.jobs });
  if (!created) return problem(500, 'run_not_created', 'The workflow run could not be created.');
  await auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'workflow.dispatched', subjectType: 'workflow', subjectId: workflow.id, details: { branch: workflow.branch, commitId: workflow.commitId } }).run();
  return json({ run: summarizeRun(created) }, { status: 201 });
}
