import type { SourcePreview } from '#lib/code/types.js';
import { apiWith, MarlApiError } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import { encodeRepositoryPath, encodeRevision } from '../repository-path';
import { loadDocument, loadFolder, loadFolderChain, parentFolder } from './content-cache.svelte';
import type { RevisionLocation } from './entry-path';
import { isMarkdown, readmeEntry } from './file/file-kind';
import type { BranchSummary } from './types';

type RepositoryParams = { owner: string; repo: string };
type PathParams = RepositoryParams & { revision: string; path: string };
type CodeEvent<Params> = { fetch: typeof fetch; params: Params; url: URL };

function requestPreview(fetcher: typeof fetch, location: RevisionLocation, path: string) {
  return apiWith<SourcePreview>(
    fetcher,
    `/repositories/${location.owner}/${location.repository}/source/${encodeRevision(location.revision)}/${encodeRepositoryPath(path)}`
  );
}

function requestRendered(fetcher: typeof fetch, location: RevisionLocation, path: string, url: URL) {
  if (!isMarkdown(path) || url.searchParams.get('plain') === '1') return null;
  return loadDocument(fetcher, location, path).catch(() => null);
}

export async function loadRepositoryHome({
  fetch,
  params,
  url,
  parent
}: CodeEvent<RepositoryParams> & { parent: () => Promise<{ branches: BranchSummary[] }> }) {
  const location = { owner: params.owner, repository: params.repo, revision: '' };
  try {
    const root = await loadFolder(fetch, location, '');
    const readme = readmeEntry(root.entries);
    if (!readme) return { folders: { '': root }, selectedFile: undefined, preview: null, rendered: null };
    const revision = { ...location, revision: root.revision };
    const [preview, rendered] = await Promise.all([
      requestPreview(fetch, revision, readme.path),
      requestRendered(fetch, revision, readme.path, url)
    ]);
    return { folders: { '': root }, selectedFile: readme.path, preview, rendered };
  } catch (cause) {
    if (cause instanceof MarlApiError && cause.code === 'revision_not_found' && !(await parent()).branches.length)
      return { folders: null, selectedFile: undefined, preview: null, rendered: null };
    return routeLoad<never>(Promise.reject(cause));
  }
}

export async function loadCodeFolder({ fetch, params }: CodeEvent<PathParams>) {
  const location = { owner: params.owner, repository: params.repo, revision: params.revision };
  return { folders: await routeLoad(loadFolderChain(fetch, location, params.path)) };
}

export async function loadCodeFile({ fetch, params, url }: CodeEvent<PathParams>) {
  const location = { owner: params.owner, repository: params.repo, revision: params.revision };
  const rendered = requestRendered(fetch, location, params.path, url);
  const [folders, preview] = await routeLoad(
    Promise.all([
      loadFolderChain(fetch, location, parentFolder(params.path)),
      requestPreview(fetch, location, params.path)
    ])
  );
  return { folders, preview, rendered: await rendered };
}
