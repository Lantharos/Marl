export function positionFloatingPanel(
  anchor: HTMLElement,
  panel: HTMLElement,
  { width, align = 'end', matchWidth = false }: { width?: number; align?: 'start' | 'end'; matchWidth?: boolean } = {}
) {
  const viewportMargin = 12;
  const topBoundary = 60;
  const gap = 6;
  const anchorRect = anchor.getBoundingClientRect();
  const panelWidth = Math.min(matchWidth ? anchorRect.width : (width ?? 300), window.innerWidth - viewportMargin * 2);
  const preferredLeft = align === 'start' ? anchorRect.left : anchorRect.right - panelWidth;
  const left = Math.max(viewportMargin, Math.min(preferredLeft, window.innerWidth - panelWidth - viewportMargin));
  const spaceBelow = Math.max(0, window.innerHeight - anchorRect.bottom - gap - viewportMargin);
  const spaceAbove = Math.max(0, anchorRect.top - gap - topBoundary);

  panel.style.width = `${panelWidth}px`;
  panel.style.maxHeight = 'none';
  const desiredHeight = panel.scrollHeight;
  const above = desiredHeight > spaceBelow && desiredHeight <= spaceAbove;
  const availableHeight = above ? spaceAbove : spaceBelow;
  const top = above ? anchorRect.top - gap - Math.min(desiredHeight, availableHeight) : anchorRect.bottom + gap;

  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(topBoundary, top)}px`;
  panel.style.maxHeight = `${availableHeight}px`;
}
