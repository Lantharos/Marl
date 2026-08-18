import type { WorkflowSummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => routeLoad(apiWith<{ workflows: WorkflowSummary[] }>(fetch, `/repositories/${params.owner}/${params.repo}/workflows`));
