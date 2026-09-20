import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../platform';
import * as schema from './schema';

export function database(env: Env) {
  return drizzle(env.DB, { schema });
}
