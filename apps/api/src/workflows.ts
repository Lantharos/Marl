import { parse } from 'yaml';
import type { Env } from './platform';
import { parseRunJobs, queueRun } from './runs';

type WorkflowEntry = { path: string; objectKey: string };
type WorkflowWarning = { path: string; error: string };

function branchMatches(patterns: unknown, branch: string): boolean {
  if (patterns === undefined) return true;
  if (!Array.isArray(patterns) || patterns.some((value) => typeof value !== 'string')) return false;
  return patterns.some((pattern: string) => {
    const expression = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(branch);
  });
}

function runsOnPush(value: unknown, branch: string): boolean {
  if (value === 'push') return true;
  if (Array.isArray(value)) return value.includes('push');
  if (!value || typeof value !== 'object') return false;
  const push = (value as Record<string, unknown>).push;
  if (push === null || push === true) return true;
  return Boolean(push && typeof push === 'object' && branchMatches((push as Record<string, unknown>).branches, branch));
}

function workflowJobs(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).map(([key, raw]) => raw && typeof raw === 'object' ? { key, name: key, ...(raw as Record<string, unknown>) } : raw);
}

export async function queuePushWorkflows(env: Env, repositoryId: string, branch: string, commitId: string, treeId: string, actorId: string | null): Promise<{ queued: number; warnings: WorkflowWarning[] }> {
  const entries = await env.DB.prepare(`SELECT path,object_key AS objectKey FROM repository_entries WHERE repository_id=? AND tree_id=? AND kind='blob' AND (path LIKE '.sty/workflows/%.yml' OR path LIKE '.sty/workflows/%.yaml') ORDER BY path LIMIT 50`).bind(repositoryId, treeId).all<WorkflowEntry>();
  const warnings: WorkflowWarning[] = [];
  let queued = 0;
  for (const entry of entries.results) {
    const object = await env.OBJECTS.get(entry.objectKey);
    if (!object || object.size > 1024 * 1024) {
      warnings.push({ path: entry.path, error: 'Workflow file is missing or larger than 1 MiB.' });
      continue;
    }
    try {
      const value = parse(await new Response(object.body).text(), { maxAliasCount: 10 }) as Record<string, unknown> | null;
      if (!value || typeof value.name !== 'string' || value.name.trim().length < 2 || value.name.length > 160 || !runsOnPush(value.on, branch)) continue;
      const parsed = parseRunJobs(workflowJobs(value.jobs));
      if (parsed.error) {
        warnings.push({ path: entry.path, error: parsed.error.detail });
        continue;
      }
      await queueRun(env, { repositoryId, name: value.name.trim(), trigger: 'push', branch, commitId, actorId, jobs: parsed.jobs });
      queued += 1;
    } catch (error) {
      warnings.push({ path: entry.path, error: error instanceof Error ? error.message.slice(0, 240) : 'Workflow YAML is invalid.' });
    }
  }
  return { queued, warnings };
}
