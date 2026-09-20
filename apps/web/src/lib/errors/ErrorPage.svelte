<script lang="ts">
  import type { Snippet } from 'svelte';
  import WifiOff from 'lucide-svelte/icons/wifi-off';

  let { status, title, scene, children } = $props<{
    status?: number;
    title: string;
    scene: string;
    children: Snippet;
  }>();
</script>

<section class="error-page" class:offline={!status} aria-labelledby="error-title">
  <div class="error-message">
    <div class="error-content">
      {#if status}
        <p class="error-status">{status}</p>
      {:else}
        <div class="error-symbol" aria-hidden="true"><WifiOff size={120} strokeWidth={1.25} /></div>
      {/if}
      <div class="error-recovery">
        <h1 id="error-title" class="error-title">{title}</h1>
        <div class="error-actions">{@render children()}</div>
      </div>
    </div>
  </div>
  <div
    class="error-illustration"
    aria-hidden="true"
    style:--art-dark={`url('/errors/${scene}-dark.webp')`}
    style:--art-light={`url('/errors/${scene}-light.webp')`}
    style:--art-small-dark={`url('/errors/${scene}-dark-small.webp')`}
    style:--art-small-light={`url('/errors/${scene}-light-small.webp')`}
  ></div>
</section>
