import { api } from '$lib/api';
import type { MarkdownContext } from '$lib/markdown/context';

const cache = new Map<string, Promise<string>>();

export function markdownPreview(source: string, context?: MarkdownContext) {
  const key = `${context?.owner ?? ''}/${context?.repository ?? ''}\n${source}`;
  let preview = cache.get(key);
  if (!preview) {
    preview = api<{ html: string }>('/markdown', {
      method: 'POST',
      body: JSON.stringify({ source, owner: context?.owner, repository: context?.repository })
    }).then((result) => result.html);
    preview.catch(() => cache.delete(key));
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
    cache.set(key, preview);
  }
  return preview;
}
