import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth, twoFactor, username } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import { validSlug } from '../domain';
import { sendTransactionalEmail } from '../email';
import type { Env } from '../platform';
import { authSchema } from './schema';
import { stepUp } from './step-up';

export function createAuth(env: Env, request: Request) {
  const publicOrigin = env.PUBLIC_URL || new URL(request.url).origin;
  const publicUrl = new URL(publicOrigin);
  const secret = env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is required.');

  return betterAuth({
    appName: 'Marl',
    baseURL: publicUrl.origin,
    basePath: '/api/auth',
    secret,
    database: drizzleAdapter(drizzle(env.DB as unknown as D1Database), { provider: 'sqlite', schema: authSchema }),
    trustedOrigins: [publicUrl.origin],
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === '/update-user' && context.body?.username !== undefined) throw new APIError('BAD_REQUEST', { message: 'Username changes are not available yet.' });
        if (context.path !== '/sign-up/email') return;
        const candidate = typeof context.body?.username === 'string' ? context.body.username.toLowerCase() : '';
        if (!validSlug(candidate)) throw new APIError('BAD_REQUEST', { message: 'Choose a valid username.' });
        const unavailable = await usernameUnavailable(env, candidate);
        if (unavailable) throw new APIError('BAD_REQUEST', { message: 'That username is unavailable.' });
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
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['ave'],
        allowDifferentEmails: false,
        disableImplicitLinking: true
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
      stepUp(env),
      ...aveProvider(env)
    ]
  });
}

async function usernameUnavailable(env: Env, candidate: string) {
  const [organization, user] = await Promise.all([
    env.DB.prepare('SELECT 1 AS found FROM organizations WHERE slug=? COLLATE NOCASE LIMIT 1').bind(candidate).first(),
    env.DB.prepare('SELECT email,auth_user_id AS authUserId FROM users WHERE handle=? COLLATE NOCASE LIMIT 1').bind(candidate).first<{ email: string | null; authUserId: string | null }>()
  ]);
  if (organization) return true;
  if (!user) return false;
  return env.ENVIRONMENT !== 'development' || user.email !== null || user.authUserId !== null;
}

function aveProvider(env: Env) {
  if (!env.AVE_CLIENT_ID || !env.AVE_CLIENT_SECRET) return [];
  return [genericOAuth({
    config: [{
      providerId: 'ave',
      authorizationUrl: 'https://aveid.net/signin',
      tokenUrl: 'https://api.aveid.net/api/oauth/token',
      userInfoUrl: 'https://api.aveid.net/api/oauth/userinfo',
      clientId: env.AVE_CLIENT_ID,
      clientSecret: env.AVE_CLIENT_SECRET,
      scopes: ['openid', 'profile', 'email'],
      pkce: true,
      disableImplicitSignUp: true
    }]
  })];
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
