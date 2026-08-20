import { apiTextWith, apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export type RepositoryDocument = { path: string; label: string };
type Overview = { documents: RepositoryDocument[]; availableDocuments: RepositoryDocument[]; canManage: boolean };

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const repository = (await parent()).repository;
  const revision = repository.defaultBranch ?? 'main';
  const overview = await routeLoad(apiWith<Overview>(fetch, `/repositories/${params.owner}/${params.repo}/overview`));
  const activeDocument = overview.documents[0] ?? null;
  const documentContent = activeDocument
    ? await apiTextWith(fetch, `/repositories/${params.owner}/${params.repo}/blob/${encodeURIComponent(revision)}/${activeDocument.path.split('/').map(encodeURIComponent).join('/')}`).catch(() => '')
    : '';
  return { revision, ...overview, activeDocument, documentContent };
};
