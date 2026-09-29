import mermaid from 'mermaid';

const secure = [
  ...new Set([...Object.keys(mermaid.mermaidAPI.defaultConfig), 'secure', 'dompurifyConfig', 'themeCSS', 'htmlLabels'])
];

function themeVariables() {
  const probe = document.createElement('span');
  probe.hidden = true;
  document.body.append(probe);
  const token = (name: string) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  const surface = token('--color-surface');
  const raised = token('--color-surface-raised');
  const text = token('--color-ink-strong');
  const muted = token('--color-ink-muted');
  const line = token('--color-line-strong');
  probe.remove();
  return {
    background: 'transparent',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '14px',
    primaryColor: raised,
    primaryTextColor: text,
    primaryBorderColor: line,
    secondaryColor: surface,
    secondaryTextColor: text,
    secondaryBorderColor: line,
    tertiaryColor: surface,
    tertiaryTextColor: text,
    tertiaryBorderColor: line,
    lineColor: muted,
    textColor: text,
    mainBkg: raised,
    nodeBorder: line,
    clusterBkg: surface,
    clusterBorder: line,
    edgeLabelBackground: surface,
    titleColor: text,
    noteBkgColor: surface,
    noteTextColor: text,
    noteBorderColor: line,
    actorBkg: raised,
    actorBorder: line,
    actorTextColor: text,
    signalColor: muted,
    signalTextColor: text,
    labelBoxBkgColor: surface,
    labelTextColor: text
  };
}

export async function renderMermaid(target: HTMLElement, source: string, signal: AbortSignal) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    maxTextSize: 50_000,
    maxEdges: 500,
    suppressErrorRendering: true,
    theme: 'base',
    themeVariables: themeVariables(),
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: 'basis' },
    secure
  });
  const { svg } = await mermaid.render(`diagram-${crypto.randomUUID()}`, source);
  if (signal.aborted) return () => {};
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = document.createElement('img');
  image.src = url;
  image.alt = 'Mermaid diagram';
  target.append(image);
  return () => URL.revokeObjectURL(url);
}
