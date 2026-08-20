export function positionFloatingPanel(anchor: HTMLElement, panel: HTMLElement, preferredWidth: number) {
  const viewportMargin = 12;
  const topBoundary = 64;
  const gap = 8;
  const anchorRect = anchor.getBoundingClientRect();
  const width = Math.min(preferredWidth, window.innerWidth - viewportMargin * 2);
  const left = Math.max(viewportMargin, Math.min(anchorRect.right - width, window.innerWidth - width - viewportMargin));
  const spaceBelow = Math.max(0, window.innerHeight - anchorRect.bottom - gap - viewportMargin);
  const spaceAbove = Math.max(0, anchorRect.top - gap - topBoundary);

  panel.style.width = `${width}px`;
  panel.style.maxHeight = 'none';
  const desiredHeight = panel.scrollHeight;
  const above = desiredHeight > spaceBelow && desiredHeight <= spaceAbove;
  const availableHeight = above ? spaceAbove : spaceBelow;
  const top = above ? anchorRect.top - gap - Math.min(desiredHeight, availableHeight) : anchorRect.bottom + gap;

  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(topBoundary, top)}px`;
  panel.style.maxHeight = `${availableHeight}px`;
}
