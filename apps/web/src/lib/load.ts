import { error } from '@sveltejs/kit';
import { MarlApiError } from './api';

export async function routeLoad<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (cause) {
    if (cause instanceof MarlApiError) throw error(cause.status, cause.message);
    throw cause;
  }
}
