import { error } from '@sveltejs/kit';
import { isLegalDocument, legalDocuments } from '$lib/legal/documents';
import type { EntryGenerator, PageLoad } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => Object.keys(legalDocuments).map((document) => ({ document }));

export const load = (({ params }) => {
  if (!isLegalDocument(params.document)) error(404, 'Not found');
  return { slug: params.document, document: legalDocuments[params.document] };
}) satisfies PageLoad;
