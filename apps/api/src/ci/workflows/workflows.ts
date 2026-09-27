import { parse } from 'yaml';
import { workflowTriggeredBy } from './triggers';
import { principalHasScope, type Principal } from '../../auth/principal';
import { auditStatement } from '../../core/audit';
import { identifier } from '../../core/domain';
import { pageResult, pageSize, readCursor } from '../../http/cursor';
import { requestGitGateway } from '../../git/gateway';
import { json, problem, readBody } from '../../http/http';
import type { Env } from '../../core/platform';
import { parseRunJobs, type RunJob } from '../runs/jobs';
import { runSelect, summarizeRun } from '../runs/runs';
import { queueRun } from '../runs/queue';
import { authorizeRepository } from '../../repositories/access/access';
import { type ObjectValue, githubJobs, stringEnvironment, workflowJobs } from './github';

type WorkflowEntry = { path: string; objectId: string };

type WorkflowWarning = { path: string; error: string };

type WorkflowTrigger = 'push' | 'workflow_dispatch' | 'pull_request' | 'schedule';

type IndexedWorkflow = {
  id: string;
  path: string;
  name: string;
  source: 'marl' | 'github';
  triggers: WorkflowTrigger[];
  triggerConfig?: unknown;
  jobs: RunJob[] | null;
  error: string | null;
  pushEnabled: boolean;
  supersedePushes: boolean;
};

const knownTriggers = new Set<WorkflowTrigger>(['push', 'workflow_dispatch', 'pull_request', 'schedule']);

const executableTriggers = new Set<WorkflowTrigger>(['push', 'workflow_dispatch', 'pull_request']);

function declaredTriggers(value: unknown): WorkflowTrigger[] {
  const names =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : value && typeof value === 'object'
          ? Object.keys(value)
          : [];
  return [...new Set(names.filter((name): name is WorkflowTrigger => knownTriggers.has(name as WorkflowTrigger)))];
}

function workflowName(value: ObjectValue | null, path: string): string {
  if (typeof value?.name === 'string' && value.name.trim().length >= 2 && value.name.trim().length <= 160)
    return value.name.trim();
  return (
    path
      .split('/')
      .at(-1)
      ?.replace(/\.ya?ml$/i, '')
      .replaceAll('-', ' ') || 'Workflow'
  );
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

export function parseWorkflow(
  value: ObjectValue,
  path: string
): { jobs: RunJob[]; error?: never } | { jobs?: never; error: string } {
  try {
    const source = path.startsWith('.github/workflows/')
      ? githubJobs(value.jobs, stringEnvironment(value.env))
      : workflowJobs(value.jobs);
    const parsed = parseRunJobs(source);
    return parsed.error ? { error: parsed.error.detail } : { jobs: parsed.jobs };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Workflow is invalid.' };
  }
}

export async function queuePushWorkflows(
  env: Env,
  repositoryId: string,
  branch: string,
  commitId: string,
  treeId: string,
  actorId: string | null,
  queuePush = true
): Promise<{ queued: number; warnings: WorkflowWarning[] }> {
  const repository = await env.DB.prepare(
    `SELECT organizations.slug AS owner,repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=?`
  )
    .bind(repositoryId)
    .first<{ owner: string; name: string }>();
  if (!repository) return { queued: 0, warnings: [{ path: '', error: 'Repository metadata is missing.' }] };
  const entries = await env.DB.prepare(
    `SELECT path,object_id AS objectId FROM repository_entries WHERE repository_id=? AND tree_id=? AND kind='blob' AND (path LIKE '.marl/workflows/%.yml' OR path LIKE '.marl/workflows/%.yaml' OR path LIKE '.github/workflows/%.yml' OR path LIKE '.github/workflows/%.yaml') ORDER BY path LIMIT 100`
  )
    .bind(repositoryId, treeId)
    .all<WorkflowEntry>();
  const existing = await env.DB.prepare('SELECT id,path FROM workflows WHERE repository_id=? AND branch=?')
    .bind(repositoryId, branch)
    .all<{ id: string; path: string }>();
  const existingIds = new Map(existing.results.map((workflow) => [workflow.path, workflow.id]));
  const warnings: WorkflowWarning[] = [];
  const indexed: IndexedWorkflow[] = [];
  let queued = 0;
  for (let offset = 0; offset < entries.results.length; offset += 8) {
    const batch = await Promise.all(
      entries.results.slice(offset, offset + 8).map(async (entry) => ({
        entry,
        object: await requestGitGateway(
          env,
          '/_marl/blob',
          { owner: repository.owner, repository: repository.name, objectId: entry.objectId },
          { attempts: 2 }
        )
      }))
    );
    for (const { entry, object } of batch) {
      const source = object.ok ? await readBody(object, 1024 * 1024) : null;
      if (!source) {
        const error = 'Workflow file is missing or larger than 1 MiB.';
        warnings.push({ path: entry.path, error });
        indexed.push({
          id: existingIds.get(entry.path) ?? identifier('workflow'),
          path: entry.path,
          name: workflowName(null, entry.path),
          source: entry.path.startsWith('.github/') ? 'github' : 'marl',
          triggers: [],
          jobs: null,
          error,
          pushEnabled: false,
          supersedePushes: true
        });
        continue;
      }
      try {
        const value = parse(new TextDecoder('utf-8', { fatal: true }).decode(source), {
          maxAliasCount: 10
        }) as ObjectValue | null;
        const triggers = declaredTriggers(value?.on);
        const parsed = value ? parseWorkflow(value, entry.path) : { error: 'Workflow YAML must contain an object.' };
        const unsupported = triggers.filter((trigger) => !executableTriggers.has(trigger));
        const error = !triggers.length
          ? 'Workflow must declare push, pull_request, or workflow_dispatch.'
          : unsupported.length
            ? `${unsupported.join(', ')} ${unsupported.length === 1 ? 'is' : 'are'} not supported yet.`
            : (parsed.error ?? null);
        if (error) warnings.push({ path: entry.path, error });
        indexed.push({
          id: existingIds.get(entry.path) ?? identifier('workflow'),
          path: entry.path,
          name: workflowName(value, entry.path),
          source: entry.path.startsWith('.github/') ? 'github' : 'marl',
          triggers,
          triggerConfig: value?.on,
          jobs: parsed.jobs ?? null,
          error,
          pushEnabled: workflowTriggeredBy(value?.on, 'push', branch),
          supersedePushes: supersedePushes(value)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 240) : 'Workflow YAML is invalid.';
        warnings.push({ path: entry.path, error: message });
        indexed.push({
          id: existingIds.get(entry.path) ?? identifier('workflow'),
          path: entry.path,
          name: workflowName(null, entry.path),
          source: entry.path.startsWith('.github/') ? 'github' : 'marl',
          triggers: [],
          jobs: null,
          error: message,
          pushEnabled: false,
          supersedePushes: true
        });
      }
    }
  }
  const statements = [
    env.DB.prepare(
      'UPDATE workflows SET active=0,updated_at=CURRENT_TIMESTAMP WHERE repository_id=? AND branch=?'
    ).bind(repositoryId, branch)
  ];
  for (const workflow of indexed) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO workflows (id,repository_id,branch,path,name,source,triggers_json,trigger_config_json,jobs_json,status,error,commit_id,supersede_pushes,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1) ON CONFLICT(repository_id,branch,path) DO UPDATE SET name=excluded.name,source=excluded.source,triggers_json=excluded.triggers_json,trigger_config_json=excluded.trigger_config_json,jobs_json=excluded.jobs_json,status=excluded.status,error=excluded.error,commit_id=excluded.commit_id,supersede_pushes=excluded.supersede_pushes,active=1,updated_at=CURRENT_TIMESTAMP`
      ).bind(
        workflow.id,
        repositoryId,
        branch,
        workflow.path,
        workflow.name,
        workflow.source,
        JSON.stringify(workflow.triggers),
        JSON.stringify(workflow.triggerConfig ?? workflow.triggers),
        workflow.jobs ? JSON.stringify(workflow.jobs) : null,
        workflow.error ? 'invalid' : 'valid',
        workflow.error,
        commitId,
        workflow.supersedePushes ? 1 : 0
      )
    );
  }
  await env.DB.batch(statements);
  for (const workflow of indexed) {
    if (!queuePush || workflow.error || !workflow.jobs || !workflow.pushEnabled) continue;
    await queueRun(env, {
      repositoryId,
      workflowId: workflow.id,
      name: workflow.name,
      trigger: 'push',
      branch,
      commitId,
      actorId,
      jobs: workflow.jobs,
      supersede: workflow.supersedePushes
    });
    queued += 1;
  }
  return { queued, warnings };
}

type WorkflowRow = Record<string, unknown> & {
  id: string;
  triggersJson: string;
  jobsJson: string | null;
  runCount: number;
  lastRunId: string | null;
  active: number;
};

function workflowSummary(row: WorkflowRow, lastRun?: Record<string, unknown> | null) {
  const jobs = row.jobsJson ? (JSON.parse(row.jobsJson) as unknown[]) : [];
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
  const where = workflowId
    ? 'workflows.repository_id=? AND workflows.id=?'
    : 'workflows.repository_id=? AND workflows.branch=repositories.default_branch AND workflows.active=1';
  const values = workflowId ? [repositoryId, workflowId] : [repositoryId];
  const rows = await env.DB.prepare(
    `SELECT workflows.id,workflows.name,workflows.path,workflows.source,workflows.branch,workflows.commit_id AS commitId,workflows.triggers_json AS triggersJson,workflows.jobs_json AS jobsJson,workflows.status,workflows.error,workflows.active,workflows.updated_at AS updatedAt,(SELECT COUNT(*) FROM runs WHERE runs.workflow_id=workflows.id) AS runCount,(SELECT id FROM runs WHERE runs.workflow_id=workflows.id ORDER BY created_at DESC LIMIT 1) AS lastRunId FROM workflows JOIN repositories ON repositories.id=workflows.repository_id WHERE ${where} ORDER BY workflows.name`
  )
    .bind(...values)
    .all<WorkflowRow>();
  return rows.results;
}

export async function listWorkflows(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository?.role) return problem(404, 'repository_not_found', 'Repository not found.');
  const rows = await workflowRows(env, repository.id);
  const lastRunIds = rows.map((row) => row.lastRunId).filter((id): id is string => typeof id === 'string');
  const lastRuns = new Map<string, Record<string, unknown>>();
  if (lastRunIds.length) {
    const placeholders = lastRunIds.map(() => '?').join(',');
    const runs = await env.DB.prepare(runSelect(`WHERE runs.id IN (${placeholders})`))
      .bind(...lastRunIds)
      .all<Record<string, unknown>>();
    for (const run of runs.results) lastRuns.set(String(run.id), run);
  }
  return json({
    workflows: rows.map((row) => workflowSummary(row, row.lastRunId ? lastRuns.get(row.lastRunId) : null))
  });
}

export async function getWorkflow(
  env: Env,
  principal: Principal | null,
  owner: string,
  name: string,
  workflowId: string,
  url: URL
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository?.role) return problem(404, 'repository_not_found', 'Repository not found.');
  const workflow = (await workflowRows(env, repository.id, workflowId))[0];
  if (!workflow) return problem(404, 'workflow_not_found', 'Workflow not found.');
  const limit = pageSize(url);
  const cursor = readCursor(url);
  const after = cursor ? 'AND (runs.created_at<? OR (runs.created_at=? AND runs.id<?))' : '';
  const values = cursor
    ? [repository.id, workflow.id, cursor.value, cursor.value, cursor.id, limit + 1]
    : [repository.id, workflow.id, limit + 1];
  const runs = await env.DB.prepare(
    runSelect(
      `WHERE runs.repository_id=? AND runs.workflow_id=? ${after} ORDER BY runs.created_at DESC,runs.id DESC LIMIT ?`
    )
  )
    .bind(...values)
    .all<Record<string, unknown>>();
  const page = pageResult(runs.results, limit, (row) => ({ value: String(row.queuedAt), id: String(row.id) }));
  return json({
    workflow: { ...workflowSummary(workflow, page.items[0]), runs: page.items.map(summarizeRun) },
    nextCursor: page.nextCursor
  });
}

export async function dispatchWorkflow(
  env: Env,
  principal: Principal,
  owner: string,
  name: string,
  workflowId: string
): Promise<Response> {
  if (!principalHasScope(principal, 'workflow:dispatch'))
    return problem(403, 'token_scope_required', 'This token cannot dispatch workflows.');
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.push');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const workflow = (await workflowRows(env, repository.id, workflowId))[0];
  if (!workflow || !workflow.active || workflow.status !== 'valid' || !workflow.jobsJson)
    return problem(409, 'workflow_not_runnable', 'This workflow is not runnable.');
  const triggers = JSON.parse(workflow.triggersJson) as WorkflowTrigger[];
  if (!triggers.includes('workflow_dispatch'))
    return problem(409, 'workflow_not_manual', 'This workflow does not declare workflow_dispatch.');
  const branch = await env.DB.prepare('SELECT commit_id AS commitId FROM branches WHERE repository_id=? AND name=?')
    .bind(repository.id, workflow.branch)
    .first<{ commitId: string }>();
  if (!branch || branch.commitId !== workflow.commitId)
    return problem(
      409,
      'workflow_catalog_stale',
      'The workflow catalog is updating. Try again after the latest push is indexed.'
    );
  const parsed = parseRunJobs(JSON.parse(workflow.jobsJson));
  if (parsed.error) return problem(409, parsed.error.code, parsed.error.detail);
  const created = await queueRun(env, {
    repositoryId: repository.id,
    workflowId: workflow.id,
    name: String(workflow.name),
    trigger: 'workflow_dispatch',
    branch: String(workflow.branch),
    commitId: String(workflow.commitId),
    actorId: principal.id,
    jobs: parsed.jobs
  });
  if (!created) return problem(500, 'run_not_created', 'The workflow run could not be created.');
  await auditStatement(env, {
    organizationId: repository.organizationId,
    repositoryId: repository.id,
    actor: principal,
    action: 'workflow.dispatched',
    subjectType: 'workflow',
    subjectId: workflow.id,
    details: { branch: workflow.branch, commitId: workflow.commitId }
  }).run();
  return json({ run: summarizeRun(created) }, { status: 201 });
}
