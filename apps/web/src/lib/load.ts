import { error } from '@sveltejs/kit';
import { StyApiError } from './api';

export async function routeLoad<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (cause) {
    if (cause instanceof StyApiError) throw error(cause.status, cause.message);
    throw cause;
  }
}
