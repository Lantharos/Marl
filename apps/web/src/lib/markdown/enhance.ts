export function enhanceMarkdown(root: HTMLDivElement) {
  const abort = new AbortController();
  const cleanup: (() => void)[] = [];
  const signal = abort.signal;
  const pending = new Set(root.querySelectorAll<HTMLElement>('pre>code, [data-math]'));
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !pending.delete(entry.target as HTMLElement)) continue;
      observer.unobserve(entry.target);
      void enhance(entry.target as HTMLElement);
    }
  }, { rootMargin: '100px' });
  for (const node of pending) observer.observe(node);
  for (const swatch of root.querySelectorAll<HTMLElement>('.color-swatch[data-color]')) {
    const color = swatch.dataset.color ?? '';
    if (CSS.supports('color', color)) swatch.style.backgroundColor = color;
  }

  async function enhance(node: HTMLElement) {
    try {
      if (node.dataset.math) {
        const module = await import('./math');
        if (!signal.aborted) module.renderMath(node);
        return;
      }
      const language = [...node.classList].find(name => name.startsWith('language-'))?.slice(9) ?? '';
      if (['mermaid', 'geojson', 'topojson', 'stl'].includes(language)) {
        const module = await import('./diagrams');
        if (signal.aborted) return;
        const dispose = await module.renderDiagram(node, language, signal);
        if (signal.aborted) dispose(); else cleanup.push(dispose);
      } else {
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'code-copy';
        copy.textContent = 'Copy';
        copy.setAttribute('aria-label', 'Copy code');
        copy.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(node.textContent ?? ''); copy.textContent = 'Copied'; }
          catch { copy.textContent = 'Select to copy'; }
        }, { signal });
        node.parentElement?.append(copy);
        if (language) { const module = await import('./highlight'); if (!signal.aborted) await module.highlightCode(node, language, signal); }
      }
    } catch {
      if (!signal.aborted) node.setAttribute('title', 'Preview unavailable; showing source.');
    }
  }

  const sources = [...root.querySelectorAll<HTMLSourceElement>('picture>source[media]')].map(node => ({ node, media: node.media }));
  function updateTheme() {
    const theme = document.documentElement.dataset.theme ?? 'dark';
    for (const { node, media } of sources) node.media = media.replace(/\(prefers-color-scheme:\s*(dark|light)\)/g, (_, mode) => mode === theme ? '(min-width: 0px)' : '(max-width: -1px)');
  }
  updateTheme();
  const themeObserver = new MutationObserver(updateTheme);
  if (sources.length) themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function scrollToAnchor() {
    let hash: string;
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (!hash) return;
    const target = [...root.querySelectorAll<HTMLElement>('[id]')].find(node => node.id === hash || node.dataset.anchor === hash);
    if (!target) return;
    for (let parent = target.parentElement; parent && parent !== root; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
    target.scrollIntoView({ block: 'start' });
  }
  for (const heading of root.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')) {
    const link = document.createElement('a');
    link.className = 'heading-anchor';
    link.href = `#${heading.id}`;
    link.textContent = '#';
    link.setAttribute('aria-label', `Link to ${heading.textContent}`);
    heading.append(link);
  }
  window.addEventListener('hashchange', scrollToAnchor, { signal });
  scrollToAnchor();
  return () => { abort.abort(); observer.disconnect(); themeObserver.disconnect(); cleanup.forEach(dispose => dispose()); };
}
