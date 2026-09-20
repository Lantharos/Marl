import type { SourcePreview } from '$lib/code/types';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => ({
  preview: await routeLoad(apiWith<SourcePreview>(fetch, `/repositories/${params.owner}/${params.repo}/source/${encodeRevision(params.revision)}/${encodeRepositoryPath(params.path ?? 'README.md')}`))
});
