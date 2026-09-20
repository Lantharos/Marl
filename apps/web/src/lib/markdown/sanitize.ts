import sanitizeHtml from 'sanitize-html';
import { resolveMarkdownUrl, resolveSrcset, type MarkdownContext } from './urls';

export function sanitizeMarkdown(html: string, context: MarkdownContext | undefined, prefix: string) {
  const anchor = (id: string) => {
    try { id = decodeURIComponent(id); } catch {}
    return `${prefix}${id.replace(/^user-content-/, '')}`;
  };
  return sanitizeHtml(html, {
    allowedTags: ['a', 'abbr', 'b', 'blockquote', 'br', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'picture', 'pre', 'q', 's', 'samp', 'section', 'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var', 'video'],
    allowedAttributes: {
      '*': ['id', 'dir', 'align', 'aria-label', 'class'],
      a: ['href', 'title', 'target', 'rel', 'aria-describedby', 'data-footnote-ref', 'data-footnote-backref', 'data-anchor'],
      abbr: ['title'], blockquote: ['class'], code: ['class'], col: ['span', 'width'], colgroup: ['span', 'width'],
      details: ['open'], div: ['class', 'data-math'], h1: ['data-anchor'], h2: ['data-anchor'], h3: ['data-anchor'], h4: ['data-anchor'], h5: ['data-anchor'], h6: ['data-anchor'],
      img: ['src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height', 'data-color-mode'],
      input: ['type', 'checked', 'disabled'], li: ['class'], ol: ['start', 'reversed'], pre: ['class'],
      section: ['class', 'data-footnotes'], source: ['srcset', 'media', 'sizes', 'type'], span: ['class', 'data-math', 'data-color'],
      table: ['width'], td: ['colspan', 'rowspan', 'width', 'height'], th: ['colspan', 'rowspan', 'width', 'height'], ul: ['class'],
      video: ['src', 'title', 'preload', 'playsinline']
    },
    allowedClasses: { '*': [], blockquote: ['markdown-alert', 'markdown-alert-note', 'markdown-alert-tip', 'markdown-alert-important', 'markdown-alert-warning', 'markdown-alert-caution'], code: [/^language-[\w+-]+$/], div: ['markdown-math'], span: ['markdown-math', 'markdown-alert-title', 'markdown-emoji', 'color-swatch'], section: ['footnotes'], h2: ['sr-only'], li: ['task-list-item'], ul: ['contains-task-list'], pre: ['plain-text'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'], source: ['http', 'https'], video: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      '*': (tagName, original) => {
        const attrs = { ...original };
        if (attrs.id || (tagName === 'a' && attrs.name)) {
          const id = attrs.id || attrs.name;
          attrs.id = anchor(id);
          if (/^(?:h[1-6]|a)$/.test(tagName)) attrs['data-anchor'] = id.replace(/^user-content-/, '');
        }
        delete attrs.name;
        if (attrs['aria-describedby']) attrs['aria-describedby'] = attrs['aria-describedby'].split(/\s+/).map(anchor).join(' ');
        if (attrs.align && !/^(?:left|right|center|justify)$/i.test(attrs.align)) delete attrs.align;
        if (attrs.dir && !/^(?:ltr|rtl|auto)$/.test(attrs.dir)) delete attrs.dir;
        if (tagName === 'a') {
          const href = attrs.href ?? '';
          attrs.href = href.startsWith('#') ? `#${encodeURIComponent(anchor(href.slice(1)))}` : attrs['data-marl-reference'] === 'true' ? href : resolveMarkdownUrl(href, context, false);
          if (/^https?:/i.test(attrs.href)) { attrs.target = '_blank'; attrs.rel = 'nofollow noopener noreferrer'; }
          else { delete attrs.target; delete attrs.rel; }
        }
        if (tagName === 'img' || tagName === 'source') {
          if (attrs.src) {
            attrs.src = resolveMarkdownUrl(attrs.src, context, true);
            const mode = attrs.src.match(/#gh-(dark|light)-mode-only$/)?.[1];
            if (mode) { attrs['data-color-mode'] = mode; attrs.src = attrs.src.replace(/#gh-(dark|light)-mode-only$/, ''); }
          }
          if (attrs.srcset) attrs.srcset = resolveSrcset(attrs.srcset, context);
          for (const size of ['width', 'height']) if (attrs[size] && !/^\d+(?:\.\d+)?%?$/.test(attrs[size])) delete attrs[size];
        }
        if (tagName === 'input') return { tagName, attribs: { type: 'checkbox', ...(attrs.checked !== undefined ? { checked: '' } : {}), disabled: '' } };
        if (tagName === 'video') return { tagName, attribs: { src: /^\/api\/v1\/media\/media_[a-zA-Z0-9_-]+$/.test(attrs.src ?? '') ? attrs.src : '', title: (attrs.title ?? '').slice(0, 256), preload: 'none', playsinline: '' } };
        return { tagName, attribs: attrs };
      }
    },
    exclusiveFilter: frame => frame.tag === 'video' && !frame.attribs.src
  });
}
