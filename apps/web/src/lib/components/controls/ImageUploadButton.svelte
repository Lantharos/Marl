<script lang="ts">
  import type { Snippet } from 'svelte';
  import Camera from '@lucide/svelte/icons/camera';
  import Check from '@lucide/svelte/icons/check';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';

  let {
    state = 'idle',
    label,
    size,
    round = false,
    onchoose,
    children
  }: {
    state?: 'idle' | 'saving' | 'saved';
    label: string;
    size: number;
    round?: boolean;
    onchoose: (file: File) => void;
    children: Snippet;
  } = $props();
  const iconSize = $derived(Math.round(size * 0.3));
  let input: HTMLInputElement;

  function choose() {
    const file = input.files?.[0];
    input.value = '';
    if (file) onchoose(file);
  }
</script>

<input bind:this={input} class="hidden" type="file" accept="image/png,image/jpeg,image/webp" onchange={choose} />

<button
  class={['group relative shrink-0 cursor-pointer', round ? 'rounded-full' : 'rounded-lg']}
  style:width={`${size}px`}
  style:height={`${size}px`}
  type="button"
  aria-label={label}
  disabled={state !== 'idle'}
  onclick={() => input.click()}
>
  {@render children()}
  <span
    class={[
      'absolute inset-0 grid place-items-center transition-opacity',
      round ? 'rounded-full' : 'rounded-lg',
      state === 'saved' ? 'bg-success-soft/90 text-success' : 'bg-canvas/80 text-ink-strong',
      state === 'idle' ? 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100' : 'opacity-100'
    ]}
  >
    {#if state === 'saving'}<LoaderCircle size={iconSize} class="animate-spin" />{:else if state === 'saved'}<Check
        size={iconSize}
      />{:else}<Camera size={iconSize} />{/if}
  </span>
  <span class="sr-only" aria-live="polite"
    >{state === 'saving' ? 'Uploading image' : state === 'saved' ? 'Image saved' : ''}</span
  >
</button>
