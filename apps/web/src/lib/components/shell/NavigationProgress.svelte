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

<div class:visible class="navigation-progress" aria-hidden="true">
  <span style:transform={`scaleX(${progress / 100})`}></span>
</div>

<style>
  .navigation-progress{position:fixed;z-index:200;inset:0 0 auto;height:2px;overflow:hidden;opacity:0;pointer-events:none;transition:opacity 120ms ease}.navigation-progress.visible{opacity:1}.navigation-progress span{display:block;width:100%;height:100%;transform-origin:left;background:var(--brand-hover);box-shadow:0 0 8px color-mix(in srgb,var(--brand) 65%,transparent);transition:transform 180ms cubic-bezier(.2,.7,.2,1)}
  @media(prefers-reduced-motion:reduce){.navigation-progress,.navigation-progress span{transition:none}}
</style>
