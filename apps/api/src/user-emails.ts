import type { Principal } from './auth';
import { requireFreshSession, sha256 } from './auth';
import { identifier } from './domain';
import { sendTransactionalEmail } from './email';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { userEmailBody, verifyUserEmailBody } from './request-schemas';

type UserEmail = { id: string; email: string; isPrimary: number; verifiedAt: string | null; createdAt: string };

export async function listUserEmails(env: Env, principal: Principal) {
  if (principal.authType !== 'session') return problem(403, 'browser_session_required', 'Emails can only be managed from a browser session.');
  const emails = await env.DB.prepare('SELECT id,email,primary_email AS isPrimary,verified_at AS verifiedAt,created_at AS createdAt FROM user_emails WHERE user_id=? ORDER BY primary_email DESC,created_at').bind(principal.id).all<UserEmail>();
  return json({ emails: emails.results.map(serializeEmail), verificationRequired: env.ENVIRONMENT !== 'development' });
}

export async function addUserEmail(request: Request, env: Env, principal: Principal) {
  if (principal.authType !== 'session') return problem(403, 'browser_session_required', 'Emails can only be managed from a browser session.');
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'identity_confirmation_required', 'Confirm your identity before adding an email.');
  const body = await readJson(request, userEmailBody);
  const email = body?.email.trim().toLowerCase() ?? '';
  if (!validEmail(email)) return problem(422, 'invalid_email', 'Enter a valid email address.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM user_emails WHERE user_id=?').bind(principal.id).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= 20) return problem(409, 'email_limit', 'An account can have up to 20 email addresses.');
  const id = identifier('email');
  const local = env.ENVIRONMENT === 'development';
  try {
    await env.DB.prepare('INSERT INTO user_emails (id,user_id,email,verified_at) VALUES (?,?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP END)').bind(id, principal.id, email, local ? 1 : 0).run();
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'email_in_use', 'That email is already connected to a Marl account.');
    throw error;
  }
  if (!local) {
    const sent = await sendVerification(env, principal, id, email);
    if (sent) return sent;
  }
  const created = await findEmail(env, principal.id, id);
  return json({ email: created && serializeEmail(created), verificationSent: !local }, { status: 201 });
}

export async function resendUserEmailVerification(env: Env, principal: Principal, id: string) {
  if (principal.authType !== 'session') return problem(403, 'browser_session_required', 'Emails can only be managed from a browser session.');
  const email = await findEmail(env, principal.id, id);
  if (!email) return problem(404, 'email_not_found', 'Email not found.');
  if (email.verifiedAt) return problem(409, 'email_already_verified', 'This email is already verified.');
  if (env.ENVIRONMENT === 'development') {
    await env.DB.prepare('UPDATE user_emails SET verified_at=CURRENT_TIMESTAMP WHERE id=?').bind(id).run();
    return json({ verified: true });
  }
  const sent = await sendVerification(env, principal, id, email.email);
  return sent ?? json({ verificationSent: true });
}

export async function verifyUserEmail(request: Request, env: Env, principal: Principal) {
  if (principal.authType !== 'session') return problem(403, 'browser_session_required', 'Sign in to verify this email.');
  const body = await readJson(request, verifyUserEmailBody);
  if (!body) return problem(422, 'invalid_email_verification', 'This verification link is invalid.');
  const tokenHash = await sha256(body.token);
  const verification = await env.DB.prepare(`SELECT user_email_verifications.user_email_id AS emailId,user_emails.user_id AS userId FROM user_email_verifications JOIN user_emails ON user_emails.id=user_email_verifications.user_email_id WHERE user_email_verifications.token_hash=? AND user_email_verifications.expires_at>CURRENT_TIMESTAMP`).bind(tokenHash).first<{ emailId: string; userId: string }>();
  if (!verification || verification.userId !== principal.id) return problem(404, 'email_verification_not_found', 'This verification link is invalid or has expired.');
  await env.DB.batch([
    env.DB.prepare('UPDATE user_emails SET verified_at=COALESCE(verified_at,CURRENT_TIMESTAMP) WHERE id=?').bind(verification.emailId),
    env.DB.prepare('DELETE FROM user_email_verifications WHERE user_email_id=?').bind(verification.emailId)
  ]);
  return json({ verified: true });
}

export async function deleteUserEmail(request: Request, env: Env, principal: Principal, id: string) {
  if (principal.authType !== 'session') return problem(403, 'browser_session_required', 'Emails can only be managed from a browser session.');
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'identity_confirmation_required', 'Confirm your identity before removing an email.');
  const email = await findEmail(env, principal.id, id);
  if (!email) return problem(404, 'email_not_found', 'Email not found.');
  if (email.isPrimary) return problem(409, 'primary_email_required', 'Your sign-in email cannot be removed here.');
  await env.DB.prepare('DELETE FROM user_emails WHERE id=? AND user_id=?').bind(id, principal.id).run();
  return new Response(null, { status: 204 });
}

async function sendVerification(env: Env, principal: Principal, emailId: string, recipient: string): Promise<Response | null> {
  const recent = await env.DB.prepare("SELECT 1 AS found FROM user_email_verifications WHERE user_email_id=? AND created_at>datetime('now','-1 minute')").bind(emailId).first();
  if (recent) return problem(429, 'email_verification_throttled', 'Wait a minute before requesting another verification email.');
  const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const tokenHash = await sha256(token);
  await env.DB.prepare(`INSERT INTO user_email_verifications (user_email_id,token_hash,expires_at) VALUES (?,?,datetime('now','+24 hours')) ON CONFLICT(user_email_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=CURRENT_TIMESTAMP`).bind(emailId, tokenHash).run();
  try {
    await sendTransactionalEmail(env, {
      recipient,
      subject: 'Verify your commit email',
      heading: 'Verify this email for commits',
      body: `Confirm that this address belongs to ${principal.displayName}. Commits authored with it will link to your current Marl profile.`,
      actionLabel: 'Verify email',
      actionUrl: `${env.PUBLIC_URL.replace(/\/$/, '')}/settings/account/emails/verify?token=${encodeURIComponent(token)}`
    });
    return null;
  } catch {
    return problem(502, 'email_delivery_failed', 'The verification email could not be sent. Try again shortly.');
  }
}

async function findEmail(env: Env, userId: string, id: string) {
  return env.DB.prepare('SELECT id,email,primary_email AS isPrimary,verified_at AS verifiedAt,created_at AS createdAt FROM user_emails WHERE id=? AND user_id=?').bind(id, userId).first<UserEmail>();
}

function serializeEmail(email: UserEmail) {
  const { isPrimary, ...value } = email;
  return { ...value, primary: Boolean(isPrimary), verified: Boolean(email.verifiedAt) };
}

function validEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
