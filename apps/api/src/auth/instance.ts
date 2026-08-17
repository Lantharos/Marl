import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth, twoFactor } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../platform';
import { authSchema } from './schema';

export function createAuth(env: Env, request: Request) {
  const publicOrigin = env.PUBLIC_URL || new URL(request.url).origin;
  const publicUrl = new URL(publicOrigin);
  const secret = env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is required.');

  return betterAuth({
    appName: 'Sty',
    baseURL: publicUrl.origin,
    basePath: '/api/auth',
    secret,
    database: drizzleAdapter(drizzle(env.DB as unknown as D1Database), { provider: 'sqlite', schema: authSchema }),
    trustedOrigins: [publicUrl.origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: env.ENVIRONMENT !== 'development',
      sendResetPassword: async ({ user, url }) => sendAuthEmail(env, user.email, 'Reset your Sty password', url)
    },
    emailVerification: {
      sendOnSignUp: env.ENVIRONMENT !== 'development',
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => sendAuthEmail(env, user.email, 'Verify your Sty account', url)
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rateLimit',
      fields: { key: 'key', count: 'count', lastRequest: 'lastRequest' },
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
        '/forget-password': { window: 300, max: 3 },
        '/sign-in/passkey': { window: 60, max: 10 }
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
      cookiePrefix: 'sty',
      useSecureCookies: env.ENVIRONMENT !== 'development'
    },
    plugins: [
      passkey({ rpID: publicUrl.hostname, rpName: 'Sty', origin: publicUrl.origin }),
      twoFactor({ issuer: 'Sty', allowPasswordless: true }),
      ...aveProvider(env)
    ]
  });
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
  if (!env.AUTH_MAILER) {
    if (env.ENVIRONMENT === 'development') {
      console.info(`[auth email] ${subject} for ${recipient}: ${actionUrl}`);
      return;
    }
    throw new Error('The authentication mailer is not configured.');
  }
  const response = await env.AUTH_MAILER.fetch('https://auth-mailer.internal/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipient, subject, actionUrl })
  });
  if (!response.ok) throw new Error(`Authentication mail delivery failed (${response.status}).`);
}
