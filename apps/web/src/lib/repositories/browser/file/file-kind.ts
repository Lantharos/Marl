import type { TreeEntry } from '../types';

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);

export function isMarkdown(path: string) {
  return /\.(?:md|markdown)$/i.test(path);
}

export function isPreviewableImage(contentType: string) {
  return imageTypes.has(contentType);
}

export function readmeEntry(entries: TreeEntry[]) {
  return entries.find((entry) => entry.kind === 'blob' && /^readme(?:\.(?:md|markdown|txt))?$/i.test(entry.name));
}
