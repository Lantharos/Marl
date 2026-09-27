import type { Agent } from '@marl/contracts';
import { issueToken } from '../account/developer-tokens';
import { requireFreshSession, type Principal } from '../auth/principal';
import { auditStatement } from '../core/audit';
import { identifier, validIdentitySlug } from '../core/domain';
import type { Env } from '../core/platform';
import { json, problem, readJson } from '../http/http';
import { agentBody, agentUpdateBody, personalAccessTokenBody } from '../http/request-schemas';
import { requireOrganizationRole } from '../repositories/access/access';

const agentSelect = `SELECT users.id,users.handle,users.display_name AS displayName,users.avatar_url AS avatarUrl,users.bio AS description,users.created_at AS createdAt,(SELECT COUNT(*) FROM personal_access_tokens WHERE user_id=users.id AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP) AS activeTokens,(SELECT MAX(last_used_at) FROM personal_access_tokens WHERE user_id=users.id) AS lastUsedAt,(SELECT COUNT(*) FROM repository_collaborators WHERE user_id=users.id) AS repositories FROM users`;

async function organizationForOperator(env: Env, principal: Principal, slug: string) {
  if (principal.authType !== 'session') return null;
  const organization = await env.DB.prepare('SELECT id,slug FROM organizations WHERE slug=? COLLATE NOCASE')
    .bind(slug)
    .first<{ id: string; slug: string }>();
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin'))) return null;
  return organization;
}

async function operatedAgent(env: Env, principal: Principal, agentId: string) {
  if (principal.authType !== 'session') return null;
  const agent = await env.DB.prepare(
    "SELECT id,handle,operator_organization_id AS organizationId FROM users WHERE id=? AND kind='agent' AND deleted_at IS NULL"
  )
    .bind(agentId)
    .first<{ id: string; handle: string; organizationId: string }>();
  if (!agent || !(await requireOrganizationRole(env, principal, agent.organizationId, 'admin'))) return null;
  return agent;
}

async function handleTaken(env: Env, handle: string) {
  const row = await env.DB.prepare(
    'SELECT 1 FROM users WHERE handle=?1 COLLATE NOCASE UNION SELECT 1 FROM organizations WHERE slug=?1 COLLATE NOCASE LIMIT 1'
  )
    .bind(handle)
    .first();
  return Boolean(row);
}

export async function listAgents(env: Env, principal: Principal, slug: string) {
  const organization = await organizationForOperator(env, principal, slug);
  if (!organization) return problem(404, 'organization_not_found', 'Organization not found.');
  const rows = await env.DB.prepare(
    `${agentSelect} WHERE users.kind='agent' AND users.operator_organization_id=? AND users.deleted_at IS NULL ORDER BY users.handle`
  )
    .bind(organization.id)
    .all<Agent>();
  return json({ agents: rows.results });
}

export async function createAgent(request: Request, env: Env, principal: Principal, slug: string) {
  const organization = await organizationForOperator(env, principal, slug);
  if (!organization) return problem(404, 'organization_not_found', 'Organization not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before creating an agent.');
  const body = await readJson(request, agentBody);
  const handle = body?.handle.toLowerCase() ?? '';
  if (!body || !validIdentitySlug(handle))
    return problem(422, 'invalid_agent', 'Choose a valid username for the agent.');
  if (await handleTaken(env, handle)) return problem(409, 'handle_unavailable', 'That username is unavailable.');
  const id = identifier('agent');
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id,handle,display_name,bio,kind,operator_organization_id) VALUES (?,?,?,?,'agent',?)"
    ).bind(id, handle, body.displayName.trim(), body.description.trim(), organization.id),
    auditStatement(env, {
      organizationId: organization.id,
      actor: principal,
      action: 'agent.created',
      subjectType: 'user',
      subjectId: id,
      details: { handle }
    })
  ]);
  const agent = await env.DB.prepare(`${agentSelect} WHERE users.id=?`).bind(id).first<Agent>();
  return json({ agent }, { status: 201 });
}

export async function updateAgent(request: Request, env: Env, principal: Principal, agentId: string) {
  const agent = await operatedAgent(env, principal, agentId);
  if (!agent) return problem(404, 'agent_not_found', 'Agent not found.');
  const body = await readJson(request, agentUpdateBody);
  if (!body) return problem(422, 'invalid_agent', 'The agent settings are invalid.');
  await env.DB.prepare('UPDATE users SET display_name=?,bio=? WHERE id=?')
    .bind(body.displayName.trim(), body.description.trim(), agent.id)
    .run();
  return json({ agent: await env.DB.prepare(`${agentSelect} WHERE users.id=?`).bind(agent.id).first<Agent>() });
}

export async function deleteAgent(request: Request, env: Env, principal: Principal, agentId: string) {
  const agent = await operatedAgent(env, principal, agentId);
  if (!agent) return problem(404, 'agent_not_found', 'Agent not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before deleting an agent.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM personal_access_tokens WHERE user_id=?').bind(agent.id),
    env.DB.prepare('DELETE FROM repository_collaborators WHERE user_id=?').bind(agent.id),
    env.DB.prepare('DELETE FROM team_members WHERE user_id=?').bind(agent.id),
    env.DB.prepare(
      `UPDATE users SET handle=?,display_name='Deleted agent',bio='',avatar_url=NULL,deleted_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(`deleted-${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`, agent.id),
    auditStatement(env, {
      organizationId: agent.organizationId,
      actor: principal,
      action: 'agent.deleted',
      subjectType: 'user',
      subjectId: agent.id,
      details: { handle: agent.handle }
    })
  ]);
  return new Response(null, { status: 204 });
}

export async function listAgentTokens(env: Env, principal: Principal, agentId: string) {
  const agent = await operatedAgent(env, principal, agentId);
  if (!agent) return problem(404, 'agent_not_found', 'Agent not found.');
  const rows = await env.DB.prepare(
    'SELECT id,name,token_prefix AS tokenPrefix,scopes_json AS scopesJson,repository_ids_json AS repositoryIdsJson,expires_at AS expiresAt,last_used_at AS lastUsedAt,created_at AS createdAt FROM personal_access_tokens WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC'
  )
    .bind(agent.id)
    .all<{ scopesJson: string; repositoryIdsJson: string | null } & Record<string, unknown>>();
  return json({
    tokens: rows.results.map(({ scopesJson, repositoryIdsJson, ...token }) => ({
      ...token,
      scopes: JSON.parse(scopesJson),
      repositoryIds: repositoryIdsJson ? JSON.parse(repositoryIdsJson) : null
    }))
  });
}

export async function createAgentToken(request: Request, env: Env, principal: Principal, agentId: string) {
  const agent = await operatedAgent(env, principal, agentId);
  if (!agent) return problem(404, 'agent_not_found', 'Agent not found.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before creating an agent token.');
  const body = await readJson(request, personalAccessTokenBody);
  if (!body) return problem(422, 'invalid_token', 'Token settings are invalid.');
  const response = await issueToken(env, principal, agent.id, body);
  if (response.ok)
    await auditStatement(env, {
      organizationId: agent.organizationId,
      actor: principal,
      action: 'agent.token_created',
      subjectType: 'user',
      subjectId: agent.id,
      details: { name: body.name, scopes: body.scopes }
    }).run();
  return response;
}

export async function revokeAgentToken(env: Env, principal: Principal, agentId: string, tokenId: string) {
  const agent = await operatedAgent(env, principal, agentId);
  if (!agent) return problem(404, 'agent_not_found', 'Agent not found.');
  await env.DB.prepare('UPDATE personal_access_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?')
    .bind(tokenId, agent.id)
    .run();
  return json({ revoked: true });
}
