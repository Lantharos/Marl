import type { Attachment } from 'svelte/attachments';
import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export type Placement = 'top' | 'bottom' | 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export function popoverMotion(_node: Element, { upward = false, duration = 150 } = {}): TransitionConfig {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    duration: reduced ? 0 : duration,
    easing: cubicOut,
    css: (visible, hidden) =>
      `opacity:${visible};transform:translateY(${hidden * (upward ? 4 : -4)}px) scale(${1 - hidden * 0.015})`
  };
}

function anchorNames(node: HTMLElement) {
  return node.style
    .getPropertyValue('anchor-name')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

export function anchorAs(name: string): Attachment<HTMLElement> {
  return (node) => {
    node.style.setProperty('anchor-name', [...anchorNames(node), name].join(', '));
    return () => {
      const remaining = anchorNames(node).filter((existing) => existing !== name);
      if (remaining.length) node.style.setProperty('anchor-name', remaining.join(', '));
      else node.style.removeProperty('anchor-name');
    };
  };
}
