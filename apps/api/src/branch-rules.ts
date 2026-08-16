import type { Principal } from './auth';
import { validBranchName } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';

export type MergeMethod = 'merge' | 'squash' | 'rebase';
export type BranchRule = {
  pattern: string;
  requiredApprovals: number;
  requireChecks: boolean;
  requireConversations: boolean;
  dismissStaleReviews: boolean;
  allowedMergeMethods: MergeMethod[];
};

type RepositoryAccess = { id: string; organizationId: string; role: 'owner' | 'member' };
type RuleRow = Omit<BranchRule, 'requireChecks' | 'requireConversations' | 'dismissStaleReviews' | 'allowedMergeMethods'> & { requireChecks: number; requireConversations: number; dismissStaleReviews: number; allowedMergeMethodsJson: string };

export async function branchRuleFor(env: Env, repositoryId: string, branch: string): Promise<BranchRule> {
  const row = await env.DB.prepare(`SELECT pattern,required_approvals AS requiredApprovals,require_checks AS requireChecks,require_conversations AS requireConversations,dismiss_stale_reviews AS dismissStaleReviews,allowed_merge_methods_json AS allowedMergeMethodsJson FROM branch_rules WHERE repository_id=? AND pattern IN (?, '*') ORDER BY pattern='*' LIMIT 1`).bind(repositoryId, branch).first<RuleRow>();
  return row ? mapRule(row) : { pattern: branch, requiredApprovals: 0, requireChecks: false, requireConversations: true, dismissStaleReviews: true, allowedMergeMethods: ['merge', 'squash', 'rebase'] };
}

export async function branchRulesFor(env: Env, targets: Array<{ repositoryId: string; branch: string }>): Promise<Map<string, BranchRule>> {
  const repositoryIds = [...new Set(targets.map((target) => target.repositoryId))];
  if (!repositoryIds.length) return new Map<string, BranchRule>();
  const placeholders = repositoryIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT repository_id AS repositoryId,pattern,required_approvals AS requiredApprovals,require_checks AS requireChecks,require_conversations AS requireConversations,dismiss_stale_reviews AS dismissStaleReviews,allowed_merge_methods_json AS allowedMergeMethodsJson FROM branch_rules WHERE repository_id IN (${placeholders})`).bind(...repositoryIds).all<RuleRow & { repositoryId: string }>();
  const available = new Map(rows.results.map((row) => [`${row.repositoryId}:${row.pattern}`, mapRule(row)]));
  return new Map<string, BranchRule>(targets.map((target) => {
    const key = `${target.repositoryId}:${target.branch}`;
    const fallback: BranchRule = { pattern: target.branch, requiredApprovals: 0, requireChecks: false, requireConversations: true, dismissStaleReviews: true, allowedMergeMethods: ['merge', 'squash', 'rebase'] };
    return [key, available.get(key) ?? available.get(`${target.repositoryId}:*`) ?? fallback];
  }));
}

export async function listBranchRules(env: Env, principal: Principal, owner: string, name: string) {
  const access = await repositoryAccess(env, principal, owner, name);
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  const rows = await env.DB.prepare(`SELECT pattern,required_approvals AS requiredApprovals,require_checks AS requireChecks,require_conversations AS requireConversations,dismiss_stale_reviews AS dismissStaleReviews,allowed_merge_methods_json AS allowedMergeMethodsJson FROM branch_rules WHERE repository_id=? ORDER BY pattern`).bind(access.id).all<RuleRow>();
  return json({ branchRules: rows.results.map(mapRule) });
}

export async function putBranchRule(request: Request, env: Env, principal: Principal, owner: string, name: string) {
  const access = await repositoryAccess(env, principal, owner, name);
  if (!access) return problem(404, 'repository_not_found', 'Repository not found.');
  if (access.role !== 'owner') return problem(403, 'owner_required', 'Only organization owners can change branch rules.');
  const body = await readJson(request);
  const methods = Array.isArray(body?.allowedMergeMethods) ? [...new Set(body.allowedMergeMethods)] : [];
  const requiredApprovals = Number(body?.requiredApprovals);
  if (!body || (body.pattern !== '*' && !validBranchName(body.pattern)) || !Number.isInteger(requiredApprovals) || requiredApprovals < 0 || requiredApprovals > 10 || typeof body.requireChecks !== 'boolean' || typeof body.requireConversations !== 'boolean' || typeof body.dismissStaleReviews !== 'boolean' || methods.length === 0 || methods.some((method) => !['merge', 'squash', 'rebase'].includes(String(method)))) return problem(422, 'invalid_branch_rule', 'Branch rule settings are invalid.');
  await env.DB.prepare(`INSERT INTO branch_rules (repository_id,pattern,required_approvals,require_checks,require_conversations,dismiss_stale_reviews,allowed_merge_methods_json,updated_by) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(repository_id,pattern) DO UPDATE SET required_approvals=excluded.required_approvals,require_checks=excluded.require_checks,require_conversations=excluded.require_conversations,dismiss_stale_reviews=excluded.dismiss_stale_reviews,allowed_merge_methods_json=excluded.allowed_merge_methods_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(access.id, body.pattern, requiredApprovals, Number(body.requireChecks), Number(body.requireConversations), Number(body.dismissStaleReviews), JSON.stringify(methods), principal.id).run();
  return json({ branchRule: { pattern: body.pattern, requiredApprovals, requireChecks: body.requireChecks, requireConversations: body.requireConversations, dismissStaleReviews: body.dismissStaleReviews, allowedMergeMethods: methods } });
}

async function repositoryAccess(env: Env, principal: Principal, owner: string, name: string) {
  return env.DB.prepare(`SELECT repositories.id,repositories.organization_id AS organizationId,organization_members.role FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=repositories.organization_id WHERE organizations.slug=? COLLATE NOCASE AND repositories.name=? COLLATE NOCASE AND organization_members.user_id=?`).bind(owner, name, principal.id).first<RepositoryAccess>();
}

function mapRule(row: RuleRow): BranchRule {
  const parsed = JSON.parse(row.allowedMergeMethodsJson) as MergeMethod[];
  return { pattern: row.pattern, requiredApprovals: Number(row.requiredApprovals), requireChecks: Boolean(row.requireChecks), requireConversations: Boolean(row.requireConversations), dismissStaleReviews: Boolean(row.dismissStaleReviews), allowedMergeMethods: parsed.filter((method) => ['merge', 'squash', 'rebase'].includes(method)) };
}
