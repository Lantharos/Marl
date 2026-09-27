import { renderMarkdown } from '@marl/markdown';
import type { Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';
import { readBlobPreview } from '../../git/source-preview';
import { json, problem, readJson } from '../../http/http';
import { markdownPreviewBody } from '../../http/request-schemas';
import { readBlob } from './source';

export async function renderRepositoryDocument(
  env: Env,
  principal: Principal | null,
  owner: string,
  repository: string,
  revision: string,
  path: string,
  ctx: ExecutionContext
) {
  const response = await readBlob(env, principal, owner, repository, revision, path, ctx);
  if (!response.ok || !response.body) return response;
  const preview = await readBlobPreview(response, response.body);
  if (preview.binary) return problem(415, 'document_not_text', 'This file cannot be shown as a document.');
  const format = /\.(?:md|markdown)$/i.test(path) ? 'markdown' : 'plain';
  return json({
    html: renderMarkdown(preview.content, { owner, repository, revision, path }, format, 'document'),
    truncated: preview.truncated
  });
}

export async function previewMarkdown(request: Request) {
  const body = await readJson(request, markdownPreviewBody);
  if (!body) return problem(422, 'invalid_markdown', 'Markdown previews are limited to 100,000 characters.');
  const context = body.owner && body.repository ? { owner: body.owner, repository: body.repository } : undefined;
  return json({ html: body.source ? renderMarkdown(body.source, context, 'markdown', 'preview') : '' });
}
