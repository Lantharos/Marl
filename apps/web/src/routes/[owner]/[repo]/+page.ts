import { redirect } from '@sveltejs/kit';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import { repositoryDocumentPath } from '$lib/repositories/repository-path';
import type { PageLoad } from './$types';

export type RepositoryDocument = { path: string; label: string };
type Overview = { documents: RepositoryDocument[]; availableDocuments: RepositoryDocument[]; canManage: boolean };

export const load = (async ({ fetch, params, parent, url }) => {
  const parentData = await parent();
  const revision = parentData.repository.defaultBranch ?? 'main';
  const overview = await routeLoad(apiWith<Overview>(fetch, `/repositories/${params.owner}/${params.repo}/overview`));
  if (parentData.shellUser && !overview.documents.length && !url.searchParams.has('overview'))
    redirect(307, `/${params.owner}/${params.repo}/code`);
  const activeDocument = overview.documents[0] ?? null;
  const documentHtml = activeDocument
    ? await apiWith<{ html: string }>(
        fetch,
        repositoryDocumentPath(params.owner, params.repo, revision, activeDocument.path)
      )
        .then((result) => result.html)
        .catch(() => null)
    : null;
  return { revision, ...overview, activeDocument, documentHtml };
}) satisfies PageLoad;
