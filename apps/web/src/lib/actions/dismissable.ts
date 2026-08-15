export function dismissable(node: HTMLElement, onDismiss: () => void) {
  function handlePointer(event: PointerEvent) {
    if (!node.contains(event.target as Node)) onDismiss();
  }

  function handleFocus(event: FocusEvent) {
    if (!node.contains(event.target as Node)) onDismiss();
  }

  document.addEventListener('pointerdown', handlePointer, true);
  document.addEventListener('focusin', handleFocus, true);

  return {
    update(next: () => void) {
      onDismiss = next;
    },
    destroy() {
      document.removeEventListener('pointerdown', handlePointer, true);
      document.removeEventListener('focusin', handleFocus, true);
    }
  };
}
