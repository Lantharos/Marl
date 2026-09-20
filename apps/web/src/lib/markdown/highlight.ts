import { highlight } from '$lib/code/highlight';

export async function highlightCode(code: HTMLElement, language: string, signal: AbortSignal) {
  const lines = await highlight(code.textContent ?? '', language, signal);
  if (signal.aborted || !lines.length) return;
  const fragment = document.createDocumentFragment();
  for (const [index, line] of lines.entries()) {
    if (index) fragment.append('\n');
    for (const token of line) {
      const span = document.createElement('span');
      span.textContent = token.text;
      span.style.setProperty('--shiki-light', token.light);
      span.style.setProperty('--shiki-dark', token.dark);
      fragment.append(span);
    }
  }
  code.replaceChildren(fragment);
  code.classList.add('highlighted');
}
