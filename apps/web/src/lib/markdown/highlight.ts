import { bundledLanguages, createHighlighter, createJavaScriptRegexEngine, type BundledLanguage } from 'shiki';

const highlighter = createHighlighter({ themes: ['github-light', 'github-dark'], langs: [], engine: createJavaScriptRegexEngine() });

export async function highlightCode(code: HTMLElement, language: string, signal: AbortSignal) {
  if (!Object.hasOwn(bundledLanguages, language) || (code.textContent?.length ?? 0) > 100_000) return;
  const engine = await highlighter;
  await engine.loadLanguage(language as BundledLanguage);
  if (signal.aborted) return;
  const result = engine.codeToTokens(code.textContent ?? '', { lang: language as BundledLanguage, themes: { light: 'github-light', dark: 'github-dark' } });
  const fragment = document.createDocumentFragment();
  for (const [index, line] of result.tokens.entries()) {
    if (index) fragment.append('\n');
    for (const token of line) {
      const span = document.createElement('span');
      span.textContent = token.content;
      for (const [name, value] of Object.entries(token.htmlStyle ?? {})) span.style.setProperty(name, String(value));
      if (token.color) span.style.color = token.color;
      fragment.append(span);
    }
  }
  code.replaceChildren(fragment);
  code.classList.add('highlighted');
}
