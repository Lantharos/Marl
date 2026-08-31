import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ fetch }) => routeLoad(apiWith(fetch, '/tokens'));
