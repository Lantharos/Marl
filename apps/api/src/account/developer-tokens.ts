import type { InferOutput } from 'valibot';
import type { Principal } from '../auth/principal';
import { requireFreshSession, sha256 } from '../auth/principal';
import { identifier } from '../core/domain';
import { json, problem, readJson } from '../http/http';
import type { Env } from '../core/platform';
import { personalAccessTokenBody } from '../http/request-schemas';
import { authorizeRepositoryId } from '../repositories/access/access';

export async function listPersonalAccessTokens(env: Env, principal: Principal) {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Developer tokens can only be managed from a browser session.');
  const rows = await env.DB.prepare(
    `SELECT id,name,token_prefix AS tokenPrefix,scopes_json AS scopesJson,repository_ids_json AS repositoryIdsJson,expires_at AS expiresAt,last_used_at AS lastUsedAt,created_at AS createdAt FROM personal_access_tokens WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC`
  )
    .bind(principal.id)
    .all<{
      id: string;
      name: string;
      tokenPrefix: string;
      scopesJson: string;
      repositoryIdsJson: string | null;
      expiresAt: string;
      lastUsedAt: string | null;
      createdAt: string;
    }>();
  return json({
    tokens: rows.results.map(({ scopesJson, repositoryIdsJson, ...token }) => ({
      ...token,
      scopes: JSON.parse(scopesJson),
      repositoryIds: repositoryIdsJson ? JSON.parse(repositoryIdsJson) : null
    }))
  });
}

export async function createPersonalAccessToken(request: Request, env: Env, principal: Principal) {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Developer tokens can only be managed from a browser session.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before creating a developer token.');
  const body = await readJson(request, personalAccessTokenBody);
  if (!body) return problem(422, 'invalid_token', 'Developer token settings are invalid.');
  return issueToken(env, principal, principal.id, body);
}

export async function issueToken(
  env: Env,
  issuer: Principal,
  userId: string,
  body: InferOutput<typeof personalAccessTokenBody>
) {
  const scopes = [...new Set(body.scopes)];
  const repositoryIds = body.repositoryIds?.length ? [...new Set(body.repositoryIds)] : null;
  if (repositoryIds) {
    for (const repositoryId of repositoryIds) {
      const accessible = await authorizeRepositoryId(env, issuer, repositoryId, 'repository.read');
      if (!accessible) return problem(422, 'invalid_token_repository', 'A selected repository is unavailable.');
    }
  }
  const id = identifier('token');
  const secret = randomSecret();
  const token = `marl_pat_${secret}`;
  const expiresAt = new Date(Date.now() + (body.expiresDays ?? 30) * 86_400_000).toISOString();
  await env.DB.prepare(
    `INSERT INTO personal_access_tokens (id,user_id,name,token_hash,token_prefix,scopes_json,repository_ids_json,expires_at) VALUES (?,?,?,?,?,?,?,?)`
  )
    .bind(
      id,
      userId,
      body.name,
      await sha256(token),
      token.slice(0, 16),
      JSON.stringify(scopes),
      repositoryIds ? JSON.stringify(repositoryIds) : null,
      expiresAt
    )
    .run();
  return json(
    { token: { id, name: body.name, value: token, tokenPrefix: token.slice(0, 16), scopes, repositoryIds, expiresAt } },
    { status: 201 }
  );
}

export async function revokePersonalAccessToken(request: Request, env: Env, principal: Principal, tokenId: string) {
  if (principal.authType === 'token')
    return problem(403, 'browser_session_required', 'Developer tokens can only be managed from a browser session.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before revoking a developer token.');
  await env.DB.prepare(
    'UPDATE personal_access_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND revoked_at IS NULL'
  )
    .bind(tokenId, principal.id)
    .run();
  return json({ revoked: true });
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
