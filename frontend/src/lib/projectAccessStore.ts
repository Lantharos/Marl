import { writable } from 'svelte/store';
import type { AccessResponse } from './api';

export const currentProjectAccess = writable<AccessResponse | null>(null);
