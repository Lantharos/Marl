import { loadCodeFolder } from '#lib/repositories/browser/code-loads.js';
import type { PageLoad } from './$types';

export const load = loadCodeFolder satisfies PageLoad;
