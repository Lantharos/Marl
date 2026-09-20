import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import light from '@shikijs/themes/github-light';
import dark from '@shikijs/themes/github-dark';
import { languages } from './languages';
import type { CodeLines, HighlightRequest, HighlightResponse } from './types';

const engine = createHighlighterCore({ themes: [light, dark], langs: [], engine: createJavaScriptRegexEngine() });
const cache = new Map<string, { lines: CodeLines; bytes: number }>();
let cacheBytes = 0;
let queue = Promise.resolve();

self.onmessage = (event: MessageEvent<HighlightRequest>) => {
  queue = queue.then(async () => {
    const { id, source, language } = event.data;
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      const key = `${language}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      const cached = cache.get(key);
      if (cached) {
        cache.delete(key); cache.set(key, cached);
        self.postMessage({ id, lines: cached.lines } satisfies HighlightResponse);
        return;
      }
      const highlighter = await engine;
      const loader = languages[language];
      if (!loader) { self.postMessage({ id, lines: [] } satisfies HighlightResponse); return; }
      await highlighter.loadLanguage(...(await loader()).default);
      const result = highlighter.codeToTokens(source, { lang: language, themes: { light: 'github-light', dark: 'github-dark' } });
      const lines = result.tokens.map(line => line.map(token => ({ text: token.content, light: String(token.htmlStyle?.['--shiki-light'] ?? token.htmlStyle?.color ?? token.color ?? ''), dark: String(token.htmlStyle?.['--shiki-dark'] ?? token.color ?? '') })));
      const bytes = source.length * 2 + lines.reduce((total, line) => total + line.length * 96, 0);
      if (bytes <= 12_000_000) {
        cache.set(key, { lines, bytes }); cacheBytes += bytes;
        while (cacheBytes > 12_000_000) { const oldest = cache.keys().next().value!; cacheBytes -= cache.get(oldest)!.bytes; cache.delete(oldest); }
      }
      self.postMessage({ id, lines } satisfies HighlightResponse);
    } catch {
      self.postMessage({ id, error: 'Highlighting unavailable' } satisfies HighlightResponse);
    }
  });
};
