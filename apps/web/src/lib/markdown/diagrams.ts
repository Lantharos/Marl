export async function renderDiagram(code: HTMLElement, language: string, signal: AbortSignal) {
  const source = code.textContent ?? '';
  if (source.length > (language === 'mermaid' ? 50_000 : 500_000)) throw new Error('This preview is too large. The source is available below.');
  const pre = code.parentElement!;
  const figure = document.createElement('figure');
  figure.className = 'markdown-diagram';
  const viewport = document.createElement('div');
  viewport.className = 'diagram-viewport';
  const canvas = document.createElement('div');
  canvas.className = 'diagram-canvas';
  viewport.append(canvas);
  const toolbar = document.createElement('div');
  toolbar.className = 'diagram-toolbar';
  let zoom = 1;
  for (const [label, action] of [['Zoom out', () => zoom = Math.max(0.5, zoom - 0.25)], ['Reset zoom', () => zoom = 1], ['Zoom in', () => zoom = Math.min(3, zoom + 0.25)]] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label === 'Zoom in' ? '+' : label === 'Zoom out' ? '−' : 'Reset';
    button.setAttribute('aria-label', label);
    button.onclick = () => { action(); if (language === 'stl') canvas.dispatchEvent(new CustomEvent('diagram-zoom', { detail: zoom })); else canvas.style.width = `${zoom * 100}%`; };
    toolbar.append(button);
  }
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Source';
  details.append(summary);
  figure.append(toolbar, viewport, details);
  if (signal.aborted) return () => {};
  pre.replaceWith(figure);
  details.append(pre);
  let cleanup: (() => void) | undefined;
  try {
    if (language === 'mermaid') cleanup = await (await import('./mermaid')).renderMermaid(canvas, source, signal);
    else if (language === 'stl') { const module = await import('./stl'); if (!signal.aborted) cleanup = module.renderStl(canvas, source); }
    else { const module = await import('./geometry'); if (!signal.aborted) cleanup = module.renderMap(canvas, source, language === 'topojson'); }
  } catch (cause) {
    if (!signal.aborted) {
      viewport.textContent = cause instanceof Error ? cause.message.slice(0, 240) : 'This preview could not be rendered.';
      viewport.classList.add('preview-error');
      details.open = true;
      toolbar.remove();
    }
  }
  return () => cleanup?.();
}
