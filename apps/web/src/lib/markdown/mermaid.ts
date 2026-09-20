import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', maxTextSize: 50_000, maxEdges: 500, suppressErrorRendering: true, theme: 'neutral', fontFamily: 'sans-serif', htmlLabels: false, flowchart: { htmlLabels: false }, secure: [...new Set([...Object.keys(mermaid.mermaidAPI.defaultConfig), 'secure', 'dompurifyConfig', 'themeCSS', 'htmlLabels'])] });

export async function renderMermaid(target: HTMLElement, source: string, signal: AbortSignal) {
  const id = `diagram-${crypto.randomUUID()}`;
  const { svg } = await mermaid.render(id, source);
  if (signal.aborted) return () => {};
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = document.createElement('img');
  image.src = url;
  image.alt = 'Mermaid diagram';
  target.append(image);
  return () => URL.revokeObjectURL(url);
}
