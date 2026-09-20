import { Marked, Renderer } from 'marked';
import { footnotes } from './markdown/footnotes';
import GithubSlugger from 'github-slugger';
import { markdownExtensions, plainHeading } from './markdown/extensions';
import { sanitizeMarkdown } from './markdown/sanitize';
import { escapeHtml, type MarkdownContext } from './markdown/urls';

export type { MarkdownContext } from './markdown/urls';
export type MarkdownFormat = 'markdown' | 'plain';

export function renderMarkdown(source: string, context?: MarkdownContext, format: MarkdownFormat = 'markdown', scope = '') {
  const prefix = `user-content-${scope ? `${scope.replace(/[^\w-]/g, '')}-` : ''}`;
  const normalized = source.replaceAll('\0', '\uFFFD');
  if (format === 'plain') return sanitizeMarkdown(`<pre class="plain-text">${linkifyPlainText(normalized)}</pre>`, undefined, prefix);
  const renderer = new Renderer();
  const slugger = new GithubSlugger();
  renderer.tablecell = function ({ tokens, header, align }) {
    const tag = header ? 'th' : 'td';
    return `<${tag}${align ? ` align="${align}"` : ''}>${this.parser.parseInline(tokens)}</${tag}>\n`;
  };
  renderer.heading = function ({ tokens, depth }) {
    const content = this.parser.parseInline(tokens);
    return `<h${depth} id="${escapeHtml(slugger.slug(plainHeading(content)))}">${content}</h${depth}>`;
  };
  renderer.blockquote = function ({ tokens, text }) {
    const alert = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|$)/.exec(text);
    if (!alert) return `<blockquote>\n${this.parser.parse(tokens)}</blockquote>\n`;
    const name = alert[1].toLowerCase();
    const content = structuredClone(tokens);
    const first = content[0];
    if (first?.type === 'paragraph' && first.tokens?.[0]?.type === 'text') {
      first.tokens[0].text = first.tokens[0].text.replace(/^\[![A-Z]+\](?:\r?\n)?/, '');
      if (!first.tokens[0].text) first.tokens.shift();
      if (first.tokens.at(0)?.type === 'br') first.tokens.shift();
    }
    return `<blockquote class="markdown-alert markdown-alert-${name}"><span class="markdown-alert-title">${name[0].toUpperCase()}${name.slice(1)}</span>${this.parser.parse(content)}</blockquote>\n`;
  };
  renderer.code = ({ text, lang }) => {
    const language = lang?.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\w+-]/g, '') ?? '';
    if (language === 'math') return `<div class="markdown-math" data-math="block">${escapeHtml(text)}</div>\n`;
    return `<pre><code${language ? ` class="language-${language}"` : ''}>${escapeHtml(text)}\n</code></pre>\n`;
  };
  renderer.codespan = ({ text }) => {
    const color = /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d.,% /+-]+\))$/i.test(text) ? text : '';
    return `<code>${escapeHtml(text)}</code>${color ? `<span class="color-swatch" data-color="${escapeHtml(color)}" aria-label="Color ${escapeHtml(color)}"></span>` : ''}`;
  };
  const markdown = new Marked({ gfm: true, breaks: !context?.path, renderer });
  markdown.use(footnotes(), { extensions: markdownExtensions(context) });
  return sanitizeMarkdown(markdown.parse(normalized, { async: false }) as string, context, prefix);
}

function linkifyPlainText(value: string) {
  let rendered = '';
  let offset = 0;
  for (const match of value.matchAll(/https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)]/g)) {
    const index = match.index ?? 0;
    const url = match[0];
    rendered += `${escapeHtml(value.slice(offset, index))}<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
    offset = index + url.length;
  }
  return rendered + escapeHtml(value.slice(offset));
}
