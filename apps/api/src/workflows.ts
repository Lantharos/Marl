import { parse } from 'yaml';
import type { Env } from './platform';
import { parseRunJobs, queueRun, type RunJob } from './runs';

type WorkflowEntry = { path: string; objectId: string };
type WorkflowWarning = { path: string; error: string };
type ObjectValue = Record<string, unknown>;

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
      throw new Error(`Action ${step.uses} is not supported yet. Use a run step or a supported Sty action.`);
    }
    if (typeof step.run !== 'string') throw new Error('Every GitHub Actions step needs run or uses.');
    const run = interpolate(step.run, matrix).replaceAll('${{ github.sha }}', '$STY_COMMIT').replaceAll('${{ github.ref_name }}', '$STY_BRANCH');
    if (run.includes('${{')) throw new Error(`Step ${step.name ?? index + 1} uses an expression Sty cannot evaluate yet.`);
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

export async function queuePushWorkflows(env: Env, repositoryId: string, branch: string, commitId: string, treeId: string, actorId: string | null): Promise<{ queued: number; warnings: WorkflowWarning[] }> {
  const repository = await env.DB.prepare(`SELECT organizations.slug AS owner,repositories.name FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE repositories.id=?`).bind(repositoryId).first<{ owner: string; name: string }>();
  if (!repository) return { queued: 0, warnings: [{ path: '', error: 'Repository metadata is missing.' }] };
  const entries = await env.DB.prepare(`SELECT path,object_id AS objectId FROM repository_entries WHERE repository_id=? AND tree_id=? AND kind='blob' AND (path LIKE '.sty/workflows/%.yml' OR path LIKE '.sty/workflows/%.yaml' OR path LIKE '.github/workflows/%.yml' OR path LIKE '.github/workflows/%.yaml') ORDER BY path LIMIT 100`).bind(repositoryId, treeId).all<WorkflowEntry>();
  const warnings: WorkflowWarning[] = [];
  let queued = 0;
  for (const entry of entries.results) {
    const object = await fetch(`${env.GIT_GATEWAY_URL}/_sty/blob`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sty-gateway-token': env.GIT_GATEWAY_TOKEN ?? 'sty-local' }, body: JSON.stringify({ owner: repository.owner, repository: repository.name, objectId: entry.objectId }) });
    const size = Number(object.headers.get('content-length'));
    if (!object.ok || !Number.isSafeInteger(size) || size > 1024 * 1024) { warnings.push({ path: entry.path, error: 'Workflow file is missing or larger than 1 MiB.' }); continue; }
    try {
      const value = parse(await object.text(), { maxAliasCount: 10 }) as ObjectValue | null;
      if (!value || typeof value.name !== 'string' || value.name.trim().length < 2 || value.name.length > 160 || !runsOnPush(value.on, branch)) continue;
      const parsed = parseWorkflow(value, entry.path);
      if (!parsed.jobs) { warnings.push({ path: entry.path, error: parsed.error ?? 'Workflow jobs are invalid.' }); continue; }
      await queueRun(env, { repositoryId, name: value.name.trim(), trigger: 'push', branch, commitId, actorId, jobs: parsed.jobs });
      queued += 1;
    } catch (error) {
      warnings.push({ path: entry.path, error: error instanceof Error ? error.message.slice(0, 240) : 'Workflow YAML is invalid.' });
    }
  }
  return { queued, warnings };
}
