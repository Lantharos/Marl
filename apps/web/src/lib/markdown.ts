import { Marked, Renderer } from 'marked';

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function safeUrl(value: string) {
  if (value.startsWith('/') || value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : '#';
  } catch {
    return '#';
  }
}

const renderer = new Renderer();
renderer.html = ({ text }) => escapeHtml(text);
renderer.link = function ({ href, title, tokens }) {
  const label = this.parser.parseInline(tokens);
  const safe = escapeHtml(safeUrl(href));
  const labelTitle = title ? ` title="${escapeHtml(title)}"` : '';
  const external = safe.startsWith('http') ? ' target="_blank" rel="nofollow noopener noreferrer"' : '';
  return `<a href="${safe}"${labelTitle}${external}>${label}</a>`;
};
renderer.image = ({ href, text }) => `<a href="${escapeHtml(safeUrl(href))}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(text || 'Image')}</a>`;

const markdown = new Marked({ gfm: true, breaks: true, renderer });

export function renderMarkdown(source: string) {
  return markdown.parse(source || '', { async: false }) as string;
}
