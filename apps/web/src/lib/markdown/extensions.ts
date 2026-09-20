import type { TokenizerAndRendererExtension } from 'marked';
import { nameToEmoji } from 'gemoji';
import { escapeHtml, type MarkdownContext } from './urls';
import sanitizeHtml from 'sanitize-html';

export function plainHeading(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity] ?? entity);
}

export function markdownExtensions(context?: MarkdownContext): TokenizerAndRendererExtension[] {
  return [
    {
      name: 'emoji', level: 'inline', start: source => source.indexOf(':'),
      tokenizer(source) {
        if (this.lexer.state.inRawBlock) return;
        const match = /^:([\w+-]+):/.exec(source);
        if (match && Object.hasOwn(nameToEmoji, match[1])) return { type: 'emoji', raw: match[0], text: nameToEmoji[match[1]] };
      },
      renderer: token => `<span class="markdown-emoji">${escapeHtml(token.text)}</span>`
    },
    {
      name: 'mathBlock', level: 'block', start: source => source.indexOf('$$'),
      tokenizer(source) {
        const match = /^\$\$[ \t]*\n([\s\S]+?)\n\$\$[ \t]*(?:\n|$)/.exec(source) ?? /^\$\$([^\n]+?)\$\$[ \t]*(?:\n|$)/.exec(source);
        if (match) return { type: 'mathBlock', raw: match[0], text: match[1] };
      },
      renderer: token => `<div class="markdown-math" data-math="block">${escapeHtml(token.text)}</div>\n`
    },
    {
      name: 'mathInline', level: 'inline', start: source => source.indexOf('$'),
      tokenizer(source) {
        if (this.lexer.state.inRawBlock) return;
        const match = /^\$`([^\n]+?)`\$/.exec(source) ?? /^\$(?!\s|\$)((?:\\.|[^$\n\\])+?)(?<!\s)\$(?!\d)/.exec(source);
        if (match) return { type: 'mathInline', raw: match[0], text: match[1] };
      },
      renderer: token => `<span class="markdown-math" data-math="inline">${escapeHtml(token.text)}</span>`
    },
    {
      name: 'marlReference', level: 'inline',
      start: source => source.search(/(?:[a-z0-9_.-]+\/[a-z0-9_.-]+)?[#!]\d+\b|@[a-z0-9][\w-]*|\b[0-9a-f]{7,64}\b/i),
      tokenizer(source) {
        if (this.lexer.state.inLink || this.lexer.state.inRawBlock) return;
        const reference = /^(?:([a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?))?([#!])(\d+)\b/i.exec(source);
        if (reference && (context || reference[1])) return { type: 'marlReference', raw: reference[0], href: `/${reference[1] ?? context!.owner}/${reference[2] ?? context!.repository}/${reference[3] === '#' ? 'issues' : 'pulls'}/${reference[4]}` };
        const mention = /^@([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)(?![\w-])/i.exec(source);
        if (mention) return { type: 'marlReference', raw: mention[0], href: `/${mention[1]}` };
        const commit = /^[0-9a-f]{7,64}\b/i.exec(source);
        if (commit && context && /[a-f]/i.test(commit[0])) return { type: 'marlReference', raw: commit[0], href: `/${context.owner}/${context.repository}/commit/${commit[0]}` };
      },
      renderer: token => `<a data-marl-reference="true" href="${escapeHtml(token.href)}">${escapeHtml(token.raw)}</a>`
    }
  ];
}
