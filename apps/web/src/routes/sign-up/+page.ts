import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ fetch }) => apiWith<{ emailVerificationRequired: boolean }>(fetch, '/auth/config');
