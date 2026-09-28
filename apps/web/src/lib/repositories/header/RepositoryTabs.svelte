<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { onDestroy, tick } from 'svelte';
  import type { IconComponent } from '$lib/ui/icon';

  type Tab = { key: string; href: string; label: string; icon: IconComponent; active: boolean };
  let { tabs }: { tabs: Tab[] } = $props();
  let nav = $state<HTMLElement>();
  let islandX = $state(0);
  let islandWidth = $state(0);
  let strokeWidth = $state(1);
  let ready = false;
  let animation = 0;
  let targetX = 0;
  let targetWidth = 0;
  const boundary = $derived(islandPath(islandWidth, strokeWidth, true));
  const fill = $derived(islandPath(islandWidth, strokeWidth, false));

  function islandPath(width: number, stroke: number, outline: boolean) {
    const top = stroke / 2;
    const rightCurve = Math.max(13, width - 13);
    const rightControl = Math.max(13, width - 5.8);
    const shape = `C -5.4 ${top} 0 5.4 0 12 V 29 C 0 36.2 5.8 42 13 42 H ${rightCurve} C ${rightControl} 42 ${width} 36.2 ${width} 29 V 12 C ${width} 5.4 ${width + 5.4} ${top} ${width + 12} ${top}`;
    return outline ? `M -8192 ${top} H -12 ${shape} H 8192` : `M -12 ${top} ${shape} V -2 H -12 Z`;
  }

  function move(left: number, width: number, animate: boolean) {
    if (ready && animate && Math.abs(left - targetX) < 0.01 && Math.abs(width - targetWidth) < 0.01) return;
    targetX = left;
    targetWidth = width;
    cancelAnimationFrame(animation);
    if (!ready || !animate) {
      islandX = left;
      islandWidth = width;
      ready = true;
      return;
    }
    const fromX = islandX;
    const fromWidth = islandWidth;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 280);
      const eased = 1 - Math.pow(1 - progress, 4);
      islandX = fromX + (targetX - fromX) * eased;
      islandWidth = fromWidth + (targetWidth - fromWidth) * eased;
      if (progress < 1) animation = requestAnimationFrame(step);
    };
    animation = requestAnimationFrame(step);
  }

  function update(node: HTMLElement, animate = true) {
    const active = node.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    const navBounds = node.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    strokeWidth = 1 / (window.devicePixelRatio || 1);
    move(activeBounds.left - navBounds.left + node.scrollLeft, activeBounds.width, animate);
  }

  function reveal(node: HTMLElement, smooth = false) {
    const active = node.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active || node.scrollWidth <= node.clientWidth) return;
    node.scrollTo({
      left: Math.max(0, active.offsetLeft - (node.clientWidth - active.offsetWidth) / 2),
      behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto'
    });
  }

  function track(node: HTMLElement) {
    nav = node;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        reveal(node);
        update(node, false);
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (nav === node) nav = undefined;
    };
  }

  $effect(() => {
    void page.url.pathname;
    let frame = 0;
    void tick().then(() => {
      const node = nav;
      if (node)
        frame = requestAnimationFrame(() => {
          reveal(node, true);
          update(node);
        });
    });
    return () => {
      if (browser) cancelAnimationFrame(frame);
    };
  });

  onDestroy(() => {
    if (browser) cancelAnimationFrame(animation);
  });
</script>

<nav
  {@attach track}
  aria-label="Repository"
  onscroll={() => nav && update(nav, false)}
  class="relative z-1 mx-auto flex h-10 w-[min(1240px,calc(100%-32px))] gap-1 overflow-x-auto sm:w-[min(1240px,calc(100%-48px))]"
>
  <span
    class="pointer-events-none absolute top-0 left-0 z-1 h-10.75 w-px will-change-transform"
    style:transform={`translate3d(${islandX}px,0,0)`}
    aria-hidden="true"
    ><svg viewBox="0 0 1 43" preserveAspectRatio="none" class="absolute inset-0 h-10.75 w-px overflow-visible"
      ><path class="fill-surface" d={fill}></path><path
        class="fill-none stroke-line-subtle [vector-effect:non-scaling-stroke]"
        d={boundary}
        stroke-width={strokeWidth}
        stroke-linejoin="round"
      ></path></svg
    ></span
  >
  {#each tabs as tab (tab.key)}
    <a
      href={tab.href}
      aria-current={tab.active ? 'page' : undefined}
      class={[
        'relative z-2 inline-flex h-10 shrink-0 items-center gap-1.5 px-3 text-sm font-medium transition-colors',
        tab.active ? 'text-ink-strong' : 'text-ink-muted hover:text-ink-strong'
      ]}><tab.icon size={15} />{tab.label}</a
    >
  {/each}
</nav>
