<script lang="ts">
  import { afterNavigate, beforeNavigate } from '$app/navigation';
  import { onDestroy } from 'svelte';

  let visible = $state(false);
  let progress = $state(0);
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  let advanceTimer: ReturnType<typeof setInterval> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let navigation = 0;

  function clearTimers() {
    if (revealTimer) clearTimeout(revealTimer);
    if (advanceTimer) clearInterval(advanceTimer);
    if (hideTimer) clearTimeout(hideTimer);
    revealTimer = undefined;
    advanceTimer = undefined;
    hideTimer = undefined;
  }

  function start() {
    navigation += 1;
    clearTimers();
    progress = 8;
    revealTimer = setTimeout(() => {
      visible = true;
      advanceTimer = setInterval(() => {
        const remaining = 88 - progress;
        progress = Math.min(88, progress + Math.max(0.7, remaining * 0.09));
      }, 180);
    }, 90);
  }

  function finish() {
    if (!navigation) return;
    navigation = 0;
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = undefined;
    if (!visible) {
      clearTimers();
      progress = 0;
      return;
    }
    if (advanceTimer) clearInterval(advanceTimer);
    advanceTimer = undefined;
    progress = 100;
    hideTimer = setTimeout(() => {
      visible = false;
      hideTimer = setTimeout(() => {
        progress = 0;
        hideTimer = undefined;
      }, 180);
    }, 120);
  }

  beforeNavigate(start);
  afterNavigate(finish);
  onDestroy(clearTimers);
</script>

<div
  class={[
    'pointer-events-none fixed inset-x-0 top-0 z-200 h-0.5 overflow-hidden transition-opacity duration-150',
    visible ? 'opacity-100' : 'opacity-0'
  ]}
  aria-hidden="true"
>
  <span
    class="block h-full w-full origin-left bg-brand-hover shadow-[0_0_8px_var(--color-brand)] transition-transform duration-200 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
    style:transform={`scaleX(${progress / 100})`}
  ></span>
</div>
