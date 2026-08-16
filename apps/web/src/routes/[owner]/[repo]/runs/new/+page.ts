import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branch = { name: string; commitId: string };

export const load: PageLoad = async ({ fetch, params }) => routeLoad(apiWith<{ defaultBranch: string; branches: Branch[] }>(fetch, `/repositories/${params.owner}/${params.repo}/branches`));
