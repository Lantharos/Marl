import { markdownText, renderMarkdown, type MarkdownContext } from '@marl/markdown';

export type { MarkdownContext };

export function renderBody(body: string, context: MarkdownContext, scope: string) {
  return body ? renderMarkdown(body, context, 'markdown', scope) : '';
}

const structuralBlocks = /<(h[1-6]|pre|table|figure)\b[^>]*>[\s\S]*?<\/\1>/g;

export function bodyExcerpt(html: string) {
  return markdownText(html.replace(structuralBlocks, ' '));
}
