import { Marked, Renderer } from 'marked';
import sanitizeHtml from 'sanitize-html';

export type MarkdownContext = {
  owner: string;
  repository: string;
  revision?: string;
  path?: string;
};

export type MarkdownFormat = 'markdown' | 'plain';

export function renderMarkdown(source: string, context?: MarkdownContext, format: MarkdownFormat = 'markdown') {
  const normalized = source.replaceAll('\0', '\uFFFD');
  if (format === 'plain') return sanitize(`<pre class="plain-text">${linkifyPlainText(normalized)}</pre>`);
  const markdown = new Marked({ gfm: true, breaks: false, renderer: markdownRenderer(context) });
  if (context) markdown.use({ extensions: [referenceExtension(context)] });
  return sanitize(markdown.parse(normalized, { async: false }) as string);
}

function sanitize(rendered: string) {
  return sanitizeHtml(rendered, {
    allowedTags: [
      'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em',
      'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li',
      'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody',
      'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'], blockquote: ['class'], col: ['align'], colgroup: ['align'], details: ['open'], div: ['class'],
      h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'], img: ['src', 'alt', 'title', 'width', 'height', 'align'],
      input: ['type', 'checked', 'disabled'], li: ['class'], ol: ['start'], pre: ['class'], span: ['class'], table: ['align'], td: ['align'], th: ['align'], tr: ['align'], ul: ['class']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => ({ tagName: 'a', attribs: externalLinkAttributes(attributes) }),
      input: (_tag, attributes) => ({ tagName: 'input', attribs: { type: 'checkbox', ...(attributes.checked !== undefined ? { checked: '' } : {}), disabled: '' } }),
      '*': (tagName, attributes) => ({ tagName, attribs: attributes.id ? { ...attributes, id: `user-content-${attributes.id.replace(/^user-content-/, '')}` } : attributes })
    }
  });
}

function markdownRenderer(context?: MarkdownContext) {
  const renderer = new Renderer();
  const headings = new Map<string, number>();
  renderer.heading = function ({ tokens, depth }) {
    const content = this.parser.parseInline(tokens);
    const text = tokens.map((token) => 'text' in token && typeof token.text === 'string' ? token.text : '').join(' ');
    const base = text.toLowerCase().trim().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-') || 'section';
    const occurrence = headings.get(base) ?? 0;
    headings.set(base, occurrence + 1);
    return `<h${depth} id="${occurrence ? `${base}-${occurrence}` : base}">${content}</h${depth}>`;
  };
  renderer.link = function ({ href, title, tokens }) {
    const resolved = resolveMarkdownUrl(href, context, false);
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : '';
    const external = /^https?:/i.test(resolved) ? ' target="_blank" rel="nofollow noopener noreferrer"' : '';
    return `<a href="${escapeAttribute(resolved)}"${titleAttribute}${external}>${this.parser.parseInline(tokens)}</a>`;
  };
  renderer.image = ({ href, title, text }) => {
    const resolved = resolveMarkdownUrl(href, context, true);
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : '';
    return `<img src="${escapeAttribute(resolved)}" alt="${escapeAttribute(text)}"${titleAttribute}>`;
  };
  return renderer;
}

function referenceExtension(context: MarkdownContext) {
  return {
    name: 'marlReference',
    level: 'inline' as const,
    start(source: string) { return source.search(/[#!]\d+\b/); },
    tokenizer(source: string) {
      const match = /^([#!])(\d+)\b/.exec(source);
      if (!match) return;
      return { type: 'marlReference', raw: match[0], marker: match[1], number: match[2] };
    },
    renderer(token: { marker: string; number: string }) {
      const collection = token.marker === '#' ? 'issues' : 'pulls';
      const reference = `${token.marker}${token.number}`;
      return `<a class="reference" href="/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}/${collection}/${token.number}">${reference}</a>`;
    }
  };
}

function resolveMarkdownUrl(value: string, context: MarkdownContext | undefined, image: boolean) {
  const trimmed = value.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  try {
    const absolute = new URL(trimmed);
    return ['http:', 'https:', 'mailto:'].includes(absolute.protocol) && (!image || absolute.protocol !== 'mailto:') ? trimmed : '#';
  } catch {}
  if (!context?.revision || !context.path) return '#';
  const [relativePath, fragment = ''] = trimmed.split('#', 2);
  const resolved: string[] = [];
  for (const segment of [...context.path.split('/').slice(0, -1), ...relativePath.split('/')]) {
    if (!segment || segment === '.') continue;
    if (segment === '..') resolved.pop();
    else resolved.push(segment);
  }
  if (!resolved.length) return fragment ? `#${fragment}` : '#';
  const path = resolved.map(encodeURIComponent).join('/');
  const base = `${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}`;
  const target = image
    ? `/api/v1/repositories/${base}/blob/${encodeURIComponent(context.revision)}/${path}`
    : `/${base}/blob/${encodeURIComponent(context.revision)}/${path}`;
  return fragment ? `${target}#${encodeURIComponent(fragment)}` : target;
}

function externalLinkAttributes(attributes: Record<string, string>) {
  return /^https?:/i.test(attributes.href ?? '') ? { ...attributes, target: '_blank', rel: 'nofollow noopener noreferrer' } : attributes;
}

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeHtml(value: string) {
  return escapeAttribute(value).replaceAll("'", '&#39;');
}

function linkifyPlainText(value: string) {
  let rendered = '';
  let offset = 0;
  for (const match of value.matchAll(/https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)]/g)) {
    const index = match.index ?? 0;
    const url = match[0];
    rendered += escapeHtml(value.slice(offset, index));
    rendered += `<a href="${escapeAttribute(url)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(url)}</a>`;
    offset = index + url.length;
  }
  return rendered + escapeHtml(value.slice(offset));
}
