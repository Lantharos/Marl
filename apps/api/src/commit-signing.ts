import type { SigningMode } from '@marl/contracts';
import { requireFreshSession, type Principal } from './auth';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { signingModeBody, signingPolicyBody } from './request-schemas';

export async function getSigningSettings(env: Env, principal: Principal) {
  if (principal.authType !== 'session') return problem(403, 'browser_session_required', 'Manage commit signing from a browser session.');
  const settings = await env.DB.prepare('SELECT signing_mode AS signingMode FROM users WHERE id=?').bind(principal.id).first<{ signingMode: SigningMode }>();
  return json(settings);
}

export async function updateSigningSettings(request: Request, env: Env, principal: Principal) {
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'identity_confirmation_required', 'Confirm your identity before changing commit signing.');
  const body = await readJson(request, signingModeBody);
  if (!body) return problem(422, 'invalid_signing_mode', 'Choose Optional, Vigilant, or Firewall.');
  await env.DB.prepare('UPDATE users SET signing_mode=? WHERE id=?').bind(body.signingMode, principal.id).run();
  return json(body);
}

export async function getSigningPolicy(request: Request, env: Env) {
  const body = await readJson(request, signingPolicyBody);
  if (!body) return problem(422, 'invalid_signing_policy', 'Signing policy lookup is invalid.');
  const repository = body.repositoryId
    ? await env.DB.prepare('SELECT signing_mode AS mode FROM repositories WHERE id=? AND deletion_scheduled_at IS NULL').bind(body.repositoryId).first<{ mode: SigningMode }>()
    : { mode: 'optional' as const };
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const emails = [...new Set(body.emails.map(email => email.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return json({ repositoryMode: repository.mode, identities: [] });
  const placeholders = emails.map(() => '?').join(',');
  const identities = await env.DB.prepare(`SELECT users.id AS userId,users.signing_mode AS mode,user_emails.email,ssh_keys.public_key AS publicKey,ssh_keys.fingerprint FROM user_emails JOIN users ON users.id=user_emails.user_id LEFT JOIN ssh_keys ON ssh_keys.user_id=users.id WHERE user_emails.verified_at IS NOT NULL AND user_emails.email COLLATE NOCASE IN (${placeholders}) ORDER BY users.id,ssh_keys.created_at`).bind(...emails).all<{ userId: string; mode: SigningMode; email: string; publicKey: string | null; fingerprint: string | null }>();
  const byEmail = new Map<string, { userId: string; mode: SigningMode; email: string; keys: Array<{ publicKey: string; fingerprint: string }> }>();
  for (const row of identities.results) {
    const email = row.email.toLowerCase();
    const identity = byEmail.get(email) ?? { userId: row.userId, mode: row.mode, email, keys: [] };
    if (row.publicKey && row.fingerprint) identity.keys.push({ publicKey: row.publicKey, fingerprint: row.fingerprint });
    byEmail.set(email, identity);
  }
  return json({ repositoryMode: repository.mode, identities: [...byEmail.values()] });
}

export function commitSignatureStatusSql(commitAlias = 'commits') {
  return `CASE WHEN ${commitAlias}.signature_status IN ('verified','invalid') THEN ${commitAlias}.signature_status WHEN EXISTS(SELECT 1 FROM repositories AS signing_repository WHERE signing_repository.id=${commitAlias}.repository_id AND signing_repository.signing_mode!='optional') OR EXISTS(SELECT 1 FROM user_emails AS signing_email JOIN users AS signing_user ON signing_user.id=signing_email.user_id WHERE signing_email.email=${commitAlias}.author_email COLLATE NOCASE AND signing_email.verified_at IS NOT NULL AND signing_user.signing_mode!='optional') THEN 'unverified' ELSE 'none' END`;
}
