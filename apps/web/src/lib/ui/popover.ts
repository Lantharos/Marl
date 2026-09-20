import type { Attachment } from 'svelte/attachments';
import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import { positionFloatingPanel } from './floating';

export function popoverMotion(node: Element, { upward = false, duration = 150 } = {}): TransitionConfig {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.setAttribute('data-popover-motion', '');
  return {
    duration: reduced ? 0 : duration,
    easing: cubicOut,
    css: (visible, hidden) => `opacity:${visible};transform:translateY(${hidden * (upward ? 4 : -4)}px) scale(${1 - hidden * .015})`
  };
}

export function anchoredPopover(anchor: HTMLElement | undefined, width = 300): Attachment<HTMLDivElement> {
  return (panel) => {
    if (!anchor) return;
    let frame = 0;
    const position = () => positionFloatingPanel(anchor, panel, width);
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    position();
    const observer = new ResizeObserver(schedule);
    observer.observe(panel);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
    };
  };
}
