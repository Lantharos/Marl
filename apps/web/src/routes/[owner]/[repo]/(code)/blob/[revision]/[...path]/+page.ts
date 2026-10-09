import type { SourcePreview } from '#lib/code/types.js';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import { loadDocument, loadFolderChain, parentFolder } from '#lib/repositories/browser/content-cache.svelte.js';
import { isMarkdown } from '#lib/repositories/browser/file/file-kind.js';
import { encodeRepositoryPath, encodeRevision } from '#lib/repositories/repository-path.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params, url }) => {
  const location = { owner: params.owner, repository: params.repo, revision: params.revision };
  const rendered =
    isMarkdown(params.path) && url.searchParams.get('plain') !== '1'
      ? loadDocument(fetch, location, params.path).catch(() => null)
      : null;
  const [folders, preview] = await routeLoad(
    Promise.all([
      loadFolderChain(fetch, location, parentFolder(params.path)),
      apiWith<SourcePreview>(
        fetch,
        `/repositories/${params.owner}/${params.repo}/source/${encodeRevision(params.revision)}/${encodeRepositoryPath(params.path)}`
      )
    ])
  );
  return { folders, preview, rendered: await rendered };
}) satisfies PageLoad;
