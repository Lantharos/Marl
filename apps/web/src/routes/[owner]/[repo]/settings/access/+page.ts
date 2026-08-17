import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ fetch, params }) => apiWith(fetch, `/repositories/${params.owner}/${params.repo}/access`);
