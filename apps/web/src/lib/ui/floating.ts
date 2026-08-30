export function interfaceScale() {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--interface-scale'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function positionFloatingPanel(anchor: HTMLElement, panel: HTMLElement, preferredWidth: number) {
  const scale = interfaceScale();
  const viewportMargin = 12 * scale;
  const topBoundary = 64 * scale;
  const gap = 8 * scale;
  const anchorRect = anchor.getBoundingClientRect();
  const width = Math.min(preferredWidth * scale, window.innerWidth - viewportMargin * 2);
  const left = Math.max(viewportMargin, Math.min(anchorRect.right - width, window.innerWidth - width - viewportMargin));
  const spaceBelow = Math.max(0, window.innerHeight - anchorRect.bottom - gap - viewportMargin);
  const spaceAbove = Math.max(0, anchorRect.top - gap - topBoundary);

  panel.style.width = `${width / scale}px`;
  panel.style.maxHeight = 'none';
  const desiredHeight = panel.scrollHeight * scale;
  const above = desiredHeight > spaceBelow && desiredHeight <= spaceAbove;
  const availableHeight = above ? spaceAbove : spaceBelow;
  const top = above ? anchorRect.top - gap - Math.min(desiredHeight, availableHeight) : anchorRect.bottom + gap;

  panel.style.left = `${left / scale}px`;
  panel.style.top = `${Math.max(topBoundary, top) / scale}px`;
  panel.style.maxHeight = `${availableHeight / scale}px`;
}
