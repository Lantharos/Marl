import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { symmetricDecrypt, type SecretConfig } from 'better-auth/crypto';
import { literal, object, string, union } from 'valibot';
import type { Env } from '../platform';

const verificationBody = object({
  method: union([literal('password'), literal('totp')]),
  value: string()
});

export function stepUp(env: Env) {
  return {
    id: 'marl-step-up',
    endpoints: {
      stepUpMethod: createAuthEndpoint('/step-up/method', {
        method: 'GET',
        use: [sessionMiddleware]
      }, async (context) => {
        const userId = context.context.session.user.id;
        const [passkey, twoFactor, password] = await Promise.all([
          env.DB.prepare('SELECT 1 AS found FROM auth_passkey WHERE user_id=? LIMIT 1').bind(userId).first(),
          env.DB.prepare('SELECT 1 AS found FROM auth_two_factor WHERE user_id=? AND verified=1 LIMIT 1').bind(userId).first(),
          env.DB.prepare(`SELECT 1 AS found FROM auth_account WHERE user_id=? AND provider_id='credential' AND password IS NOT NULL LIMIT 1`).bind(userId).first()
        ]);
        const method = passkey ? 'passkey' : twoFactor ? 'totp' : password ? 'password' : null;
        if (!method) throw new APIError('BAD_REQUEST', { code: 'NO_STEP_UP_METHOD', message: 'Add a passkey, authenticator app, or password before continuing.' });
        return context.json({ method });
      }),
      verifyStepUp: createAuthEndpoint('/step-up/verify', {
        method: 'POST',
        body: verificationBody,
        use: [sessionMiddleware]
      }, async (context) => {
        const { user } = context.context.session;
        if (context.body.method === 'password') await verifyAccountPassword(env, user.id, context.body.value, context.context.password.verify);
        else await verifyAuthenticatorCode(env, user.id, context.body.value, context.context.secretConfig);

        const nextSession = await context.context.internalAdapter.createSession(user.id);
        if (!nextSession) throw new APIError('INTERNAL_SERVER_ERROR', { code: 'SESSION_ROTATION_FAILED', message: 'Identity confirmation could not be completed.' });
        await setSessionCookie(context, { session: nextSession, user });
        return context.json({ status: true });
      })
    }
  };
}

async function verifyAccountPassword(env: Env, userId: string, password: string, verify: (input: { hash: string; password: string }) => Promise<boolean>) {
  const account = await env.DB.prepare(`SELECT password FROM auth_account WHERE user_id=? AND provider_id='credential' AND password IS NOT NULL LIMIT 1`).bind(userId).first<{ password: string }>();
  if (!account || !await verify({ hash: account.password, password })) {
    throw new APIError('UNAUTHORIZED', { code: 'INVALID_PASSWORD', message: 'That password is not correct.' });
  }
}

async function verifyAuthenticatorCode(env: Env, userId: string, code: string, secretConfig: string | SecretConfig) {
  const factor = await env.DB.prepare('SELECT secret,verified,failed_verification_count AS failedVerificationCount,locked_until AS lockedUntil FROM auth_two_factor WHERE user_id=? LIMIT 1').bind(userId).first<{ secret: string; verified: number; failedVerificationCount: number; lockedUntil: number | null }>();
  if (!factor?.verified) throw new APIError('BAD_REQUEST', { code: 'TOTP_NOT_ENABLED', message: 'Authenticator verification is not enabled.' });
  const now = Date.now();
  if (factor.lockedUntil && factor.lockedUntil > now) throw new APIError('TOO_MANY_REQUESTS', { code: 'TWO_FACTOR_LOCKED', message: 'Too many incorrect codes. Try again later.' });
  if (factor.lockedUntil) await env.DB.prepare('UPDATE auth_two_factor SET failed_verification_count=0,locked_until=NULL WHERE user_id=?').bind(userId).run();

  const secret = await symmetricDecrypt({ key: secretConfig, data: factor.secret });
  if (!await validTotp(secret, code)) {
    const failures = (factor.lockedUntil ? 0 : factor.failedVerificationCount) + 1;
    const lockedUntil = failures >= 10 ? now + 15 * 60_000 : null;
    await env.DB.prepare('UPDATE auth_two_factor SET failed_verification_count=?,locked_until=? WHERE user_id=?').bind(failures, lockedUntil, userId).run();
    throw new APIError('UNAUTHORIZED', { code: 'INVALID_TOTP', message: 'That authentication code is not valid.' });
  }
  await env.DB.prepare('UPDATE auth_two_factor SET failed_verification_count=0,locked_until=NULL WHERE user_id=?').bind(userId).run();
}

export async function validTotp(secret: string, candidate: string, now = Date.now()) {
  if (!/^\d{6}$/.test(candidate)) return false;
  const key = await crypto.subtle.importKey('raw', decodeBase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const counter = Math.floor(now / 30_000);
  for (const offset of [-1, 0, 1]) {
    const message = new ArrayBuffer(8);
    new DataView(message).setBigUint64(0, BigInt(counter + offset));
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
    const index = digest[digest.length - 1] & 15;
    const value = ((digest[index] & 127) << 24 | digest[index + 1] << 16 | digest[index + 2] << 8 | digest[index + 3]) % 1_000_000;
    if (value.toString().padStart(6, '0') === candidate) return true;
  }
  return false;
}

function decodeBase32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = value.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let buffer = 0;
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid authenticator secret.');
    buffer = buffer << 5 | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push(buffer >> bits & 255);
    }
  }
  return new Uint8Array(bytes);
}
