import type { SourcePreview } from '#lib/code/types.js';
import { apiWith, MarlApiError } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import { loadDocument, loadFolder } from '#lib/repositories/browser/content-cache.svelte.js';
import { isMarkdown, readmeEntry } from '#lib/repositories/browser/file/file-kind.js';
import { encodeRepositoryPath, encodeRevision } from '#lib/repositories/repository-path.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params, parent, url }) => {
  const location = { owner: params.owner, repository: params.repo, revision: '' };
  try {
    const root = await loadFolder(fetch, location, '');
    const readme = readmeEntry(root.entries);
    if (!readme) return { folders: { '': root }, selectedFile: undefined, preview: null, rendered: null };
    const revision = { ...location, revision: root.revision };
    const [preview, rendered] = await Promise.all([
      apiWith<SourcePreview>(
        fetch,
        `/repositories/${params.owner}/${params.repo}/source/${encodeRevision(root.revision)}/${encodeRepositoryPath(readme.path)}`
      ),
      isMarkdown(readme.path) && url.searchParams.get('plain') !== '1'
        ? loadDocument(fetch, revision, readme.path).catch(() => null)
        : null
    ]);
    return { folders: { '': root }, selectedFile: readme.path, preview, rendered };
  } catch (cause) {
    if (cause instanceof MarlApiError && cause.code === 'revision_not_found' && !(await parent()).branches.length)
      return { folders: null, selectedFile: undefined, preview: null, rendered: null };
    return routeLoad<never>(Promise.reject(cause));
  }
}) satisfies PageLoad;
