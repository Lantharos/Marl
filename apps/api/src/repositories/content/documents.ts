import { renderMarkdown } from '@marl/markdown';
import type { Env } from '../../core/platform';
import { readBlobPreview } from '../../git/source-preview';
import { json, problem, readJson } from '../../http/http';
import { markdownPreviewBody } from '../../http/request-schemas';
import type { RepositoryAccess } from '../access/access';
import { blobResponse } from './blobs';

type RenderedDocument = { html: string; truncated: boolean };

export async function renderDocument(
  env: Env,
  execution: ExecutionContext,
  repository: RepositoryAccess,
  revision: string,
  path: string,
  objectId: string
): Promise<RenderedDocument | Response> {
  const cacheKey = new Request(
    `https://document-cache.marl.internal/${env.CF_VERSION_METADATA.id}/${repository.id}/${objectId}/${[repository.owner, repository.name, revision, path].map(encodeURIComponent).join('/')}`
  );
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached.json<RenderedDocument>();
  const response = await blobResponse(env, execution, repository, path, objectId, false);
  if (!response.ok || !response.body) return response;
  const preview = await readBlobPreview(response, response.body);
  if (preview.binary) return problem(415, 'document_not_text', 'This file cannot be shown as a document.');
  const format = /\.(?:md|markdown)$/i.test(path) ? 'markdown' : 'plain';
  const document = {
    html: renderMarkdown(
      preview.content,
      { owner: repository.owner, repository: repository.name, revision, path },
      format,
      'document'
    ),
    truncated: preview.truncated
  };
  const stored = json(document);
  stored.headers.set('cache-control', 'public, max-age=604800');
  execution.waitUntil(caches.default.put(cacheKey, stored));
  return document;
}

export async function previewMarkdown(request: Request) {
  const body = await readJson(request, markdownPreviewBody);
  if (!body) return problem(422, 'invalid_markdown', 'Markdown previews are limited to 100,000 characters.');
  const context = body.owner && body.repository ? { owner: body.owner, repository: body.repository } : undefined;
  return json({ html: body.source ? renderMarkdown(body.source, context, 'markdown', 'preview') : '' });
}
