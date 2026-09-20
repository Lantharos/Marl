export type MarkdownContext = { owner: string; repository: string; revision?: string; path?: string };

export function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
}

export function resolveMarkdownUrl(value: string, context: MarkdownContext | undefined, image: boolean) {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f\\]/.test(trimmed) || trimmed.startsWith('//')) return '';
  if (trimmed.startsWith('#')) return trimmed;
  try {
    const absolute = new URL(trimmed);
    return ['http:', 'https:', ...(!image ? ['mailto:'] : [])].includes(absolute.protocol) ? trimmed : '';
  } catch {}
  if (trimmed.startsWith('/api/v1/')) return trimmed;
  if (!context?.revision || !context.path) return trimmed.startsWith('/') ? trimmed : '';
  const base = `${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}`;
  const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(trimmed);
  if (!match) return '';
  const resolved = trimmed.startsWith('/') ? [] : context.path.split('/').slice(0, -1);
  for (const part of match[1].split('/')) {
    let segment: string;
    try { segment = decodeURIComponent(part); } catch { return ''; }
    if (!segment || segment === '.') continue;
    if (segment === '..') resolved.pop();
    else if (/[\/\\\u0000-\u001f]/.test(segment)) return '';
    else resolved.push(segment);
  }
  const path = resolved.map(encodeURIComponent).join('/');
  const route = image ? `/api/v1/repositories/${base}/blob/` : `/${base}/blob/`;
  return `${route}${encodeURIComponent(context.revision)}/${path}${match[2] ?? ''}${match[3] ?? ''}`;
}

export function resolveSrcset(value: string, context?: MarkdownContext) {
  return value.split(',').slice(0, 24).flatMap(candidate => {
    const parts = candidate.trim().split(/\s+/);
    const src = resolveMarkdownUrl(parts[0], context, true);
    if (!src || parts.length > 2 || (parts[1] && !/^(?:\d+w|(?:\d*\.)?\d+x)$/.test(parts[1]))) return [];
    return [`${src}${parts[1] ? ` ${parts[1]}` : ''}`];
  }).join(', ');
}
