import type { Principal } from './auth';
import { auditStatement } from './audit';
import { workflowCheckName, type RequiredCheck } from './check-provenance';
import { validBranchName } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { branchRuleBody } from './request-schemas';
import { authorizeRepository } from './repository-access';
import type { RunJob } from './runs';

export type MergeMethod = 'merge' | 'squash' | 'rebase';
export type BranchRule = {
  pattern: string;
  requiredApprovals: number;
  requiredChecks: RequiredCheck[];
  requireConversations: boolean;
  dismissStaleReviews: boolean;
  allowedMergeMethods: MergeMethod[];
};

type RuleRow = Omit<BranchRule, 'requiredChecks' | 'requireConversations' | 'dismissStaleReviews' | 'allowedMergeMethods'> & {
  requiredChecksJson: string;
  requireConversations: number;
  dismissStaleReviews: number;
  allowedMergeMethodsJson: string;
};

const selectRule = 'pattern,required_approvals AS requiredApprovals,required_checks_json AS requiredChecksJson,require_conversations AS requireConversations,dismiss_stale_reviews AS dismissStaleReviews,allowed_merge_methods_json AS allowedMergeMethodsJson';

function defaultRule(pattern: string): BranchRule {
  return { pattern, requiredApprovals: 0, requiredChecks: [], requireConversations: true, dismissStaleReviews: true, allowedMergeMethods: ['merge', 'squash', 'rebase'] };
}

export async function branchRuleFor(env: Env, repositoryId: string, branch: string): Promise<BranchRule> {
  const row = await env.DB.prepare(`SELECT ${selectRule} FROM branch_rules WHERE repository_id=? AND pattern IN (?, '*') ORDER BY pattern='*' LIMIT 1`).bind(repositoryId, branch).first<RuleRow>();
  return row ? mapRule(row) : defaultRule(branch);
}

export async function branchRulesFor(env: Env, targets: Array<{ repositoryId: string; branch: string }>): Promise<Map<string, BranchRule>> {
  const repositoryIds = [...new Set(targets.map((target) => target.repositoryId))];
  if (!repositoryIds.length) return new Map();
  const placeholders = repositoryIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT repository_id AS repositoryId,${selectRule} FROM branch_rules WHERE repository_id IN (${placeholders})`).bind(...repositoryIds).all<RuleRow & { repositoryId: string }>();
  const available = new Map(rows.results.map((row) => [`${row.repositoryId}:${row.pattern}`, mapRule(row)]));
  return new Map(targets.map((target) => {
    const key = `${target.repositoryId}:${target.branch}`;
    return [key, available.get(key) ?? available.get(`${target.repositoryId}:*`) ?? defaultRule(target.branch)];
  }));
}

export async function listBranchRules(env: Env, principal: Principal, owner: string, name: string) {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  const rows = await env.DB.prepare(`SELECT ${selectRule} FROM branch_rules WHERE repository_id=? ORDER BY pattern`).bind(access.id).all<RuleRow>();
  return json({ branchRules: rows.results.map(mapRule).map(publicRule) });
}

export async function putBranchRule(request: Request, env: Env, principal: Principal, owner: string, name: string) {
  const access = await authorizeRepository(env, principal, owner, name, 'repository.maintain');
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, branchRuleBody);
  if (!body || (body.pattern !== '*' && !validBranchName(body.pattern))) return problem(422, 'invalid_branch_rule', 'Branch rule settings are invalid.');
  const methods = [...new Set(body.allowedMergeMethods)];
  const requiredCheckNames = [...new Set(body.requiredChecks.map((check) => check.trim()).filter(Boolean))];
  const requiredChecks = await resolveRequiredChecks(env, access.id, requiredCheckNames);
  if (!requiredChecks) return problem(422, 'invalid_required_checks', 'Every required check must uniquely identify a workflow job on the default branch.');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO branch_rules (repository_id,pattern,required_approvals,required_checks_json,require_conversations,dismiss_stale_reviews,allowed_merge_methods_json,updated_by) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(repository_id,pattern) DO UPDATE SET required_approvals=excluded.required_approvals,required_checks_json=excluded.required_checks_json,require_conversations=excluded.require_conversations,dismiss_stale_reviews=excluded.dismiss_stale_reviews,allowed_merge_methods_json=excluded.allowed_merge_methods_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(access.id, body.pattern, body.requiredApprovals, JSON.stringify(requiredChecks), Number(body.requireConversations), Number(body.dismissStaleReviews), JSON.stringify(methods), principal.id),
    auditStatement(env, { organizationId: access.organizationId, repositoryId: access.id, actor: principal, action: 'repository.branch_rule.updated', subjectType: 'branch_rule', subjectId: body.pattern, details: { requiredApprovals: body.requiredApprovals, requiredChecks: requiredCheckNames, requireConversations: body.requireConversations, dismissStaleReviews: body.dismissStaleReviews, allowedMergeMethods: methods } })
  ]);
  return json({ branchRule: publicRule({ pattern: body.pattern, requiredApprovals: body.requiredApprovals, requiredChecks, requireConversations: body.requireConversations, dismissStaleReviews: body.dismissStaleReviews, allowedMergeMethods: methods }) });
}

function mapRule(row: RuleRow): BranchRule {
  const value = JSON.parse(row.requiredChecksJson) as unknown;
  const requiredChecks = Array.isArray(value) ? value.flatMap((check): RequiredCheck[] => {
    if (!check || typeof check !== 'object') return [];
    const item = check as Record<string, unknown>;
    return typeof item.name === 'string' && typeof item.workflowId === 'string' && typeof item.jobKey === 'string'
      ? [{ name: item.name, workflowId: item.workflowId, jobKey: item.jobKey }]
      : [];
  }) : [];
  const methods = JSON.parse(row.allowedMergeMethodsJson) as MergeMethod[];
  return { pattern: row.pattern, requiredApprovals: Number(row.requiredApprovals), requiredChecks, requireConversations: Boolean(row.requireConversations), dismissStaleReviews: Boolean(row.dismissStaleReviews), allowedMergeMethods: methods.filter((method) => ['merge', 'squash', 'rebase'].includes(method)) };
}

function publicRule(rule: BranchRule) {
  return { ...rule, requiredChecks: rule.requiredChecks.map((check) => check.name) };
}

async function resolveRequiredChecks(env: Env, repositoryId: string, names: string[]): Promise<RequiredCheck[] | null> {
  if (!names.length) return [];
  const workflows = await env.DB.prepare(`SELECT workflows.id,workflows.name,workflows.jobs_json AS jobsJson FROM workflows JOIN repositories ON repositories.id=workflows.repository_id WHERE workflows.repository_id=? AND workflows.branch=repositories.default_branch AND workflows.active=1 AND workflows.status='valid' AND workflows.jobs_json IS NOT NULL`).bind(repositoryId).all<{ id: string; name: string; jobsJson: string }>();
  const candidates: RequiredCheck[] = [];
  for (const workflow of workflows.results) {
    let jobs: unknown;
    try { jobs = JSON.parse(workflow.jobsJson); }
    catch { continue; }
    if (!Array.isArray(jobs)) continue;
    for (const job of jobs as RunJob[]) {
      if (typeof job?.key !== 'string' || typeof job.name !== 'string') continue;
      candidates.push({ name: workflowCheckName(workflow.name, job.name), workflowId: workflow.id, jobKey: job.key });
    }
  }
  const resolved = names.map((name) => candidates.filter((candidate) => candidate.name === name));
  return resolved.some((matches) => matches.length !== 1) ? null : resolved.map((matches) => matches[0]);
}
