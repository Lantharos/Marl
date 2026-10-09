import { problem } from '../http/http';
import type { Env } from '../core/platform';
import { createAuth } from './instance';

const guardedPaths = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-in/username',
  '/api/auth/sign-up/email',
  '/api/auth/request-password-reset',
  '/api/auth/passkey/verify-authentication',
  '/api/auth/step-up/verify'
]);

async function withinAuthLimit(request: Request, env: Env) {
  const path = new URL(request.url).pathname;
  if (env.ENVIRONMENT === 'development' || !guardedPaths.has(path)) return true;
  const address = request.headers.get('cf-connecting-ip') ?? 'anonymous';
  const { success } = await env.AUTH_LIMITER.limit({ key: `${address} ${path}` });
  return success;
}

export async function handleAuth(request: Request, env: Env) {
  if (!(await withinAuthLimit(request, env)))
    return problem(429, 'rate_limited', 'Too many attempts. Wait a minute and try again.');
  try {
    return await createAuth(env, request).handler(request);
  } catch (error) {
    console.error('Authentication request failed.', error);
    return problem(500, 'authentication_failed', 'The authentication request could not be completed.');
  }
}
