import { markdownText, renderMarkdown, type MarkdownContext } from '@marl/markdown';

export type { MarkdownContext };

export function renderBody(body: string, context: MarkdownContext, scope: string) {
  return body ? renderMarkdown(body, context, 'markdown', scope) : '';
}

export function bodyExcerpt(html: string) {
  return markdownText(html);
}
