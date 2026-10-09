import type { SourcePreview } from '#lib/code/types.js';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import { encodeRepositoryPath, encodeRevision } from '#lib/repositories/repository-path.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => ({
  preview: await routeLoad(
    apiWith<SourcePreview>(
      fetch,
      `/repositories/${params.owner}/${params.repo}/source/${encodeRevision(params.revision)}/${encodeRepositoryPath(params.path)}`
    )
  )
})) satisfies PageLoad;
