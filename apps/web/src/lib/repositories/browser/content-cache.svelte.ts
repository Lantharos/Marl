import { browser } from '$app/env';
import { SvelteMap } from 'svelte/reactivity';
import { apiWith } from '#lib/api.js';
import { encodeRepositoryPath, encodeRevision } from '../repository-path';
import type { RevisionLocation } from './entry-path';
import { readmeEntry } from './file/file-kind';
import type { Folders, RenderedDocument, Tree } from './types';

type Fetcher = typeof fetch;

const folders = new SvelteMap<string, Tree>();
const pendingFolders = new Map<string, Promise<Tree>>();
const documents = new Map<string, Promise<RenderedDocument>>();

function contentKey({ owner, repository, revision }: RevisionLocation, path: string) {
  return `${owner}/${repository}\n${revision}\n${path}`;
}

function requestFolder(fetcher: Fetcher, { owner, repository, revision }: RevisionLocation, path: string) {
  const query = new URLSearchParams({ ...(revision ? { revision } : {}), ...(path ? { path } : {}) });
  return apiWith<Tree>(fetcher, `/repositories/${owner}/${repository}/tree?${query}`);
}

function requestDocument(fetcher: Fetcher, { owner, repository, revision }: RevisionLocation, path: string) {
  return apiWith<RenderedDocument>(
    fetcher,
    `/repositories/${owner}/${repository}/document/${encodeRevision(revision)}/${encodeRepositoryPath(path)}`
  );
}

export function folderChain(path: string) {
  const parts = path.split('/').filter(Boolean);
  return ['', ...parts.map((_, index) => parts.slice(0, index + 1).join('/'))];
}

export function parentFolder(path: string) {
  return path.split('/').slice(0, -1).join('/');
}

export function cachedFolder(location: RevisionLocation, path: string) {
  return folders.get(contentKey(location, path));
}

export function loadFolder(fetcher: Fetcher, location: RevisionLocation, path: string): Promise<Tree> {
  if (!browser) return requestFolder(fetcher, location, path);
  const key = contentKey(location, path);
  const known = folders.get(key);
  if (known) return Promise.resolve(known);
  let request = pendingFolders.get(key);
  if (!request) {
    request = requestFolder(fetcher, location, path)
      .then((tree) => {
        folders.set(key, tree);
        return tree;
      })
      .finally(() => pendingFolders.delete(key));
    pendingFolders.set(key, request);
  }
  return request;
}

export async function loadFolderChain(fetcher: Fetcher, location: RevisionLocation, path: string): Promise<Folders> {
  const paths = folderChain(path);
  const trees = await Promise.all(paths.map((folder) => loadFolder(fetcher, location, folder)));
  return Object.fromEntries(paths.map((folder, index) => [folder, trees[index]]));
}

export function rememberFolders(location: RevisionLocation, loaded: Folders) {
  for (const [path, tree] of Object.entries(loaded)) {
    const key = contentKey(location, path);
    if (!folders.has(key)) folders.set(key, tree);
  }
}

export function loadDocument(fetcher: Fetcher, location: RevisionLocation, path: string): Promise<RenderedDocument> {
  if (!browser) return requestDocument(fetcher, location, path);
  const key = contentKey(location, path);
  let document = documents.get(key);
  if (!document) {
    document = requestDocument(fetcher, location, path);
    document.catch(() => documents.delete(key));
    documents.set(key, document);
  }
  return document;
}

export function folderReadme(fetcher: Fetcher, location: RevisionLocation, tree: Tree) {
  const entry = readmeEntry(tree.entries);
  if (!entry) return null;
  const document = loadDocument(fetcher, { ...location, revision: tree.revision }, entry.path).catch(() => null);
  return { entry, document };
}

export function forgetContent() {
  folders.clear();
  pendingFolders.clear();
  documents.clear();
}
