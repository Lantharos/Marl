import type { Principal } from './auth';
import { requireFreshSession } from './auth';
import { auditStatement } from './audit';
import { identifier } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { authorizeRepository, requireOrganizationRole } from './repository-access';
import { decryptSecret, encryptSecret } from './secret-crypto';
import { secretValueBody } from './request-schemas';

type SecretRow = { id: string; organizationId: string; repositoryId: string | null; name: string; ciphertext: string; nonce: string; createdAt: string; updatedAt: string };
type SecretScope = { organizationId: string; repositoryId: string | null; organizationName?: string };

function validName(name: string) {
  return /^[A-Z_][A-Z0-9_]{0,127}$/.test(name);
}

async function repositoryScope(env: Env, principal: Principal, owner: string, repository: string): Promise<SecretScope | null> {
  const access = await authorizeRepository(env, principal, owner, repository, 'repository.admin');
  return access ? { organizationId: access.organizationId, repositoryId: access.id } : null;
}

async function organizationScope(env: Env, principal: Principal, slug: string): Promise<SecretScope | null> {
  const organization = await env.DB.prepare('SELECT id,name FROM organizations WHERE slug=? COLLATE NOCASE').bind(slug).first<{ id: string; name: string }>();
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin'))) return null;
  return { organizationId: organization.id, repositoryId: null, organizationName: organization.name };
}

export async function repositorySecrets(request: Request, env: Env, principal: Principal, owner: string, repository: string, name?: string) {
  const scope = await repositoryScope(env, principal, owner, repository);
  return handleSecrets(request, env, principal, scope, name);
}

export async function organizationSecrets(request: Request, env: Env, principal: Principal, slug: string, name?: string) {
  const scope = await organizationScope(env, principal, slug);
  return handleSecrets(request, env, principal, scope, name);
}

async function handleSecrets(request: Request, env: Env, principal: Principal, scope: SecretScope | null, requestedName?: string) {
  if (!scope) return problem(404, 'secret_scope_not_found', 'Secret scope not found.');
  if (request.method === 'GET' && !requestedName) {
    const rows = await env.DB.prepare('SELECT id,name,created_at AS createdAt,updated_at AS updatedAt FROM ci_secrets WHERE organization_id=? AND repository_id IS ? ORDER BY name').bind(scope.organizationId, scope.repositoryId).all();
    return json({ organizationName: scope.organizationName, secrets: rows.results });
  }
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_admin_session_required', 'Confirm your identity before changing secrets.');
  const name = requestedName ? decodeURIComponent(requestedName).toUpperCase() : '';
  if (!validName(name)) return problem(422, 'invalid_secret_name', 'Secret names must use uppercase letters, digits, and underscores.');
  if (request.method === 'PUT') {
    const body = await readJson(request, secretValueBody);
    if (!body) return problem(422, 'invalid_secret_value', 'Secret values must contain between 1 and 64,000 characters.');
    let encrypted;
    try {
      encrypted = await encryptSecret(env, scope.organizationId, scope.repositoryId, name, body.value);
    } catch {
      return problem(503, 'secret_encryption_unavailable', 'Secret encryption is not configured.');
    }
    const id = identifier('secret');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ci_secrets (id,organization_id,repository_id,name,ciphertext,nonce,created_by) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET ciphertext=excluded.ciphertext,nonce=excluded.nonce,updated_at=CURRENT_TIMESTAMP`).bind(id, scope.organizationId, scope.repositoryId, name, encrypted.ciphertext, encrypted.nonce, principal.id),
      auditStatement(env, { organizationId: scope.organizationId, repositoryId: scope.repositoryId, actor: principal, action: 'ci.secret.updated', subjectType: 'ci_secret', subjectId: name, details: { scope: scope.repositoryId ? 'repository' : 'organization' } })
    ]);
    return json({ secret: { name } });
  }
  if (request.method === 'DELETE') {
    const existing = await env.DB.prepare('SELECT id FROM ci_secrets WHERE organization_id=? AND repository_id IS ? AND name=?').bind(scope.organizationId, scope.repositoryId, name).first<{ id: string }>();
    if (!existing) return problem(404, 'secret_not_found', 'Secret not found.');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM ci_secrets WHERE id=?').bind(existing.id),
      auditStatement(env, { organizationId: scope.organizationId, repositoryId: scope.repositoryId, actor: principal, action: 'ci.secret.deleted', subjectType: 'ci_secret', subjectId: name, details: { scope: scope.repositoryId ? 'repository' : 'organization' } })
    ]);
    return new Response(null, { status: 204 });
  }
  return problem(405, 'method_not_allowed', 'This method is not allowed.');
}

export async function jobSecrets(env: Env, organizationId: string, repositoryId: string) {
  const rows = await env.DB.prepare(`SELECT organization_id AS organizationId,repository_id AS repositoryId,name,ciphertext,nonce FROM ci_secrets WHERE organization_id=? AND (repository_id IS NULL OR repository_id=?) ORDER BY repository_id IS NOT NULL`).bind(organizationId, repositoryId).all<SecretRow>();
  const values: Record<string, string> = {};
  for (const row of rows.results) values[row.name] = await decryptSecret(env, row);
  return values;
}
