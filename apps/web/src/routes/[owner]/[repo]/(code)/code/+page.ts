import { loadRepositoryHome } from '#lib/repositories/browser/code-loads.js';
import type { PageLoad } from './$types';

export const load = loadRepositoryHome satisfies PageLoad;
