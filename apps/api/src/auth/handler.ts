import { problem } from '../http';
import type { Env } from '../platform';
import { createAuth } from './instance';

export async function handleAuth(request: Request, env: Env) {
  try {
    return await createAuth(env, request).handler(request);
  } catch (error) {
    console.error('Authentication request failed.', error);
    return problem(500, 'authentication_failed', 'The authentication request could not be completed.');
  }
}
