import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor, username } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import { legalVersion } from '@marl/contracts';
import { recordLegalAcceptance } from '../account/legal';
import { validIdentitySlug } from '@marl/contracts';
import { sendTransactionalEmail } from '../core/email';
import type { Env } from '../core/platform';
import { authSchema } from './schema';
import { stepUp } from './step-up';

const instances = new Map<string, ReturnType<typeof buildAuth>>();

export function createAuth(env: Env, request: Request) {
  const configuredUrl = new URL(env.PUBLIC_URL);
  const requestOrigin = request.headers.get('origin');
  const trustedOrigins = developmentOrigins(env, configuredUrl, requestOrigin);
  const publicUrl = requestOrigin && trustedOrigins.includes(requestOrigin) ? new URL(requestOrigin) : configuredUrl;
  const key = `${publicUrl.origin} ${trustedOrigins.join(' ')}`;
  let auth = instances.get(key);
  if (!auth) instances.set(key, (auth = buildAuth(env, publicUrl, trustedOrigins)));
  return auth;
}

function buildAuth(env: Env, publicUrl: URL, trustedOrigins: string[]) {
  const secret = env.AUTH_SECRET;
  return betterAuth({
    appName: 'Marl',
    baseURL: publicUrl.origin,
    basePath: '/api/auth',
    secret,
    database: drizzleAdapter(drizzle(env.DB), { provider: 'sqlite', schema: authSchema }),
    trustedOrigins,
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === '/update-user' && context.body?.username !== undefined)
          throw new APIError('BAD_REQUEST', { message: 'Username changes are not available yet.' });
        if (context.path === '/sign-in/email' || context.path === '/sign-in/username') {
          if (await suspendedAccount(env, String(context.body?.email ?? context.body?.username ?? '')))
            throw new APIError('FORBIDDEN', {
              message: 'This account has been suspended. Write to legal@marl.sh to appeal.'
            });
          return;
        }
        if (context.path !== '/sign-up/email') return;
        if (context.body?.termsVersion !== legalVersion)
          throw new APIError('BAD_REQUEST', { message: 'Accept the Terms of Service and Privacy Policy to continue.' });
        const candidate = typeof context.body?.username === 'string' ? context.body.username.toLowerCase() : '';
        if (!validIdentitySlug(candidate)) throw new APIError('BAD_REQUEST', { message: 'Choose a valid username.' });
        const unavailable = await usernameUnavailable(env, candidate);
        if (unavailable) throw new APIError('BAD_REQUEST', { message: 'That username is unavailable.' });
      }),
      after: createAuthMiddleware(async (context) => {
        if (context.path === '/sign-up/email' && !(context.context.returned instanceof Error))
          await recordSignUpAcceptance(env, String(context.body?.email ?? ''), context.request);
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
          env.DB.prepare('DELETE FROM auth_session WHERE user_id=? AND device_id=? AND id<>?').bind(
            newSession.user.id,
            deviceId,
            newSession.session.id
          ),
          env.DB.prepare('UPDATE auth_session SET device_id=? WHERE id=? AND user_id=?').bind(
            deviceId,
            newSession.session.id,
            newSession.user.id
          )
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
      freshAge: 60 * 15,
      cookieCache: { enabled: true, maxAge: 60 }
    },
    rateLimit: { enabled: false },
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
      username({ minUsernameLength: 2, maxUsernameLength: 39, usernameValidator: validIdentitySlug }),
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
    if (requested.protocol === 'http:' && (isLoopbackHost(requested.hostname) || requested.hostname === 'marl.sh'))
      origins.add(requested.origin);
  }
  return [...origins];
}

function isLoopbackHost(hostname: string) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

async function usernameUnavailable(env: Env, candidate: string) {
  const taken = await env.DB.prepare(
    'SELECT 1 AS found FROM organizations WHERE slug=?1 COLLATE NOCASE UNION ALL SELECT 1 FROM users WHERE handle=?1 COLLATE NOCASE LIMIT 1'
  )
    .bind(candidate)
    .first();
  return Boolean(taken);
}

async function suspendedAccount(env: Env, identity: string) {
  const row = await env.DB.prepare(
    'SELECT 1 AS suspended FROM users WHERE suspended_at IS NOT NULL AND id IN (SELECT id FROM auth_user WHERE email=?1 COLLATE NOCASE UNION SELECT id FROM auth_user WHERE username=?1 COLLATE NOCASE)'
  )
    .bind(identity)
    .first();
  return Boolean(row);
}

async function recordSignUpAcceptance(env: Env, email: string, request: Request | undefined) {
  const user = await env.DB.prepare('SELECT id FROM auth_user WHERE email=? COLLATE NOCASE')
    .bind(email)
    .first<{ id: string }>();
  if (user) await recordLegalAcceptance(env, user.id, request?.headers.get('cf-connecting-ip') ?? null).run();
}

async function sendAuthEmail(env: Env, recipient: string, subject: string, actionUrl: string) {
  await sendTransactionalEmail(env, {
    recipient,
    subject,
    heading: subject,
    body: subject.startsWith('Reset')
      ? 'Use the button below to choose a new password. This link expires automatically.'
      : 'Verify this email address to finish creating your Marl account.',
    actionLabel: subject.startsWith('Reset') ? 'Reset password' : 'Verify email',
    actionUrl
  });
}
