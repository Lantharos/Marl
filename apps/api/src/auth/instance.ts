import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor, username } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import { validSlug } from '../domain';
import { sendTransactionalEmail } from '../email';
import type { Env } from '../platform';
import { authSchema } from './schema';
import { stepUp } from './step-up';

export function createAuth(env: Env, request: Request) {
  const configuredUrl = new URL(env.PUBLIC_URL || new URL(request.url).origin);
  const requestOrigin = request.headers.get('origin');
  const trustedOrigins = developmentOrigins(env, configuredUrl, requestOrigin);
  const publicUrl = requestOrigin && trustedOrigins.includes(requestOrigin) ? new URL(requestOrigin) : configuredUrl;
  const secret = env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is required.');

  return betterAuth({
    appName: 'Marl',
    baseURL: publicUrl.origin,
    basePath: '/api/auth',
    secret,
    database: drizzleAdapter(drizzle(env.DB as unknown as D1Database), { provider: 'sqlite', schema: authSchema }),
    trustedOrigins,
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === '/update-user' && context.body?.username !== undefined) throw new APIError('BAD_REQUEST', { message: 'Username changes are not available yet.' });
        if (context.path !== '/sign-up/email') return;
        const candidate = typeof context.body?.username === 'string' ? context.body.username.toLowerCase() : '';
        if (!validSlug(candidate)) throw new APIError('BAD_REQUEST', { message: 'Choose a valid username.' });
        const unavailable = await usernameUnavailable(env, candidate);
        if (unavailable) throw new APIError('BAD_REQUEST', { message: 'That username is unavailable.' });
      }),
      after: createAuthMiddleware(async (context) => {
        const newSession = context.context.newSession;
        if (!newSession) return;
        const existingDeviceId = await context.getSignedCookie('marl_device', secret);
        const deviceId = validDeviceId(existingDeviceId) ? existingDeviceId : crypto.randomUUID();
        await context.setSignedCookie('marl_device', deviceId, secret, {
          httpOnly: true,
          sameSite: 'lax',
          secure: env.ENVIRONMENT !== 'development',
          path: '/',
          maxAge: 60 * 60 * 24 * 365
        });
        await env.DB.batch([
          env.DB.prepare('DELETE FROM auth_session WHERE user_id=? AND device_id=? AND id<>?').bind(newSession.user.id, deviceId, newSession.session.id),
          env.DB.prepare('UPDATE auth_session SET device_id=? WHERE id=? AND user_id=?').bind(deviceId, newSession.session.id, newSession.user.id)
        ]);
      })
    },
    disabledPaths: ['/is-username-available'],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: env.ENVIRONMENT !== 'development',
      sendResetPassword: async ({ user, url }) => sendAuthEmail(env, user.email, 'Reset your Marl password', url)
    },
    emailVerification: {
      sendOnSignUp: env.ENVIRONMENT !== 'development',
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => sendAuthEmail(env, user.email, 'Verify your Marl account', url)
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15
    },
    rateLimit: {
      enabled: env.ENVIRONMENT !== 'development',
      storage: 'database',
      modelName: 'rateLimit',
      fields: { key: 'key', count: 'count', lastRequest: 'lastRequest' },
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-in/username': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
        '/forget-password': { window: 300, max: 3 },
        '/sign-in/passkey': { window: 60, max: 10 },
        '/step-up/verify': { window: 60, max: 5 }
      }
    },
    advanced: {
      cookiePrefix: 'marl',
      useSecureCookies: env.ENVIRONMENT !== 'development',
      ipAddress: {
        ipAddressHeaders: env.ENVIRONMENT === 'development' ? ['x-forwarded-for'] : ['cf-connecting-ip']
      }
    },
    plugins: [
      passkey({ rpID: publicUrl.hostname, rpName: 'Marl', origin: publicUrl.origin }),
      twoFactor({ issuer: 'Marl', allowPasswordless: true }),
      username({ minUsernameLength: 2, maxUsernameLength: 39, usernameValidator: validSlug }),
      stepUp(env)
    ]
  });
}

function validDeviceId(value: string | false | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function developmentOrigins(env: Env, configuredUrl: URL, requestOrigin: string | null) {
  const origins = new Set([configuredUrl.origin]);
  if (env.ENVIRONMENT !== 'development') return [...origins];
  if (configuredUrl.protocol === 'http:' && isLoopbackHost(configuredUrl.hostname)) {
    for (const hostname of ['127.0.0.1', 'localhost', '[::1]']) {
      const origin = new URL(configuredUrl);
      origin.hostname = hostname;
      origins.add(origin.origin);
    }
  }
  if (requestOrigin && URL.canParse(requestOrigin)) {
    const requested = new URL(requestOrigin);
    if (requested.protocol === 'http:' && (isLoopbackHost(requested.hostname) || requested.hostname === 'marl.sh')) origins.add(requested.origin);
  }
  return [...origins];
}

function isLoopbackHost(hostname: string) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

async function usernameUnavailable(env: Env, candidate: string) {
  const [organization, user] = await Promise.all([
    env.DB.prepare('SELECT 1 AS found FROM organizations WHERE slug=? COLLATE NOCASE LIMIT 1').bind(candidate).first(),
    env.DB.prepare('SELECT email,auth_user_id AS authUserId FROM users WHERE handle=? COLLATE NOCASE LIMIT 1').bind(candidate).first<{ email: string | null; authUserId: string | null }>()
  ]);
  if (organization) return true;
  if (!user) return false;
  return user.email !== null || user.authUserId !== null;
}

async function sendAuthEmail(env: Env, recipient: string, subject: string, actionUrl: string) {
  await sendTransactionalEmail(env, {
    recipient,
    subject,
    heading: subject,
    body: subject.startsWith('Reset') ? 'Use the button below to choose a new password. This link expires automatically.' : 'Verify this email address to finish creating your Marl account.',
    actionLabel: subject.startsWith('Reset') ? 'Reset password' : 'Verify email',
    actionUrl
  });
}
