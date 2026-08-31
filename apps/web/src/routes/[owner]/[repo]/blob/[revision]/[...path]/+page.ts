import { apiTextWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => ({
  content: await routeLoad(apiTextWith(fetch, `/repositories/${params.owner}/${params.repo}/blob/${encodeRevision(params.revision)}/${encodeRepositoryPath(params.path ?? 'README.md')}`))
});
