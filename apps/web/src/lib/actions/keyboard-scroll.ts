export function keyboardScroll(node: HTMLElement) {
  const update = () => {
    if (node.scrollWidth > node.clientWidth) node.tabIndex = 0;
    else node.removeAttribute('tabindex');
  };

  const observer = new ResizeObserver(update);
  observer.observe(node);
  for (const child of node.children) observer.observe(child);
  update();

  return () => observer.disconnect();
}
