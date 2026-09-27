export function plainKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return null;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"], dialog')) return null;
  return event.key;
}

export function stepThrough(selector: string, direction: 1 | -1, offset = 140) {
  const elements = [...document.querySelectorAll<HTMLElement>(selector)];
  const current = elements.findIndex((element) => element === document.activeElement);
  const target =
    current >= 0
      ? elements[current + direction]
      : direction === 1
        ? elements.find((element) => element.getBoundingClientRect().top > offset + 4)
        : elements.findLast((element) => element.getBoundingClientRect().top < offset - 4);
  if (!target) return false;
  target.scrollIntoView({
    block: 'start',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  });
  target.focus({ preventScroll: true });
  return true;
}
