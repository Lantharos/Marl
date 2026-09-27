import { legalVersion } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import type { Env } from '../core/platform';
import { json, problem, readJson } from '../http/http';
import { legalAcceptanceBody } from '../http/request-schemas';

export function recordLegalAcceptance(env: Env, userId: string, ipAddress: string | null) {
  return env.DB.prepare('INSERT OR IGNORE INTO legal_acceptances (user_id,version,ip_address) VALUES (?,?,?)').bind(
    userId,
    legalVersion,
    ipAddress
  );
}

export async function hasAcceptedCurrentTerms(env: Env, userId: string) {
  const row = await env.DB.prepare('SELECT 1 AS accepted FROM legal_acceptances WHERE user_id=? AND version=?')
    .bind(userId, legalVersion)
    .first();
  return Boolean(row);
}

export async function acceptLegalTerms(request: Request, env: Env, principal: Principal) {
  if (principal.authType !== 'session')
    return problem(403, 'browser_session_required', 'Accept updated terms from a browser session.');
  const body = await readJson(request, legalAcceptanceBody);
  if (!body || body.version !== legalVersion)
    return problem(409, 'legal_version_changed', 'The terms changed again. Reload the page to review them.');
  await recordLegalAcceptance(env, principal.id, request.headers.get('cf-connecting-ip')).run();
  return json({ accepted: legalVersion });
}
