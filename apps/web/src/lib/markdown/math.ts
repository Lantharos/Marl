import katex from 'katex';
import 'katex/dist/katex.min.css';

export function renderMath(node: HTMLElement) {
  const expression = node.textContent ?? '';
  if (expression.length > 10_000) return;
  katex.render(expression, node, { displayMode: node.dataset.math === 'block', throwOnError: false, trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20, output: 'htmlAndMathml' });
}
