import type { WorkflowDetail } from '@sty/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => routeLoad(apiWith<{ workflow: WorkflowDetail }>(fetch, `/repositories/${params.owner}/${params.repo}/workflows/${params.workflow}`));
