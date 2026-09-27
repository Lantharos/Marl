import type { RepositoryImport } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (({ fetch, params }) =>
  routeLoad(apiWith<{ import: RepositoryImport }>(fetch, `/imports/${params.id}`))) satisfies PageLoad;
