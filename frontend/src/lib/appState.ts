import { writable } from 'svelte/store';
import type { MeResponse, ProjectSummary } from './api';

export const appData = writable<{
	me: MeResponse | null;
	projects: ProjectSummary[];
	ready: boolean;
}>({
	me: null,
	projects: [],
	ready: false
});
