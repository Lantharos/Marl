<script lang="ts">
  import type { Snippet } from 'svelte';
  import Camera from 'lucide-svelte/icons/camera';
  import Check from 'lucide-svelte/icons/check';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';

  let { state = 'idle', label, size, round = false, onclick, children } = $props<{
    state?: 'idle' | 'saving' | 'saved';
    label: string;
    size: number;
    round?: boolean;
    onclick: () => void;
    children: Snippet;
  }>();
</script>

<button class="image-upload {state}" class:round type="button" aria-label={label} disabled={state !== 'idle'} style:--image-upload-size={`${size}px`} {onclick}>
  {@render children()}
  <span class="overlay">{#if state === 'saving'}<LoaderCircle size={Math.round(size * .3)} />{:else if state === 'saved'}<Check size={Math.round(size * .3)} />{:else}<Camera size={Math.round(size * .28)} />{/if}</span>
  <span class="status" aria-live="polite">{state === 'saving' ? 'Uploading image' : state === 'saved' ? 'Image saved' : ''}</span>
</button>

<style>
  .image-upload{position:relative;width:var(--image-upload-size);height:var(--image-upload-size);padding:0;border:0;border-radius:7px;outline:0;background:transparent;cursor:pointer}.image-upload.round,.image-upload.round .overlay{border-radius:50%}.image-upload:focus-visible{outline:2px solid var(--brand);outline-offset:3px}.overlay{position:absolute;inset:0;display:grid;border-radius:7px;background:color-mix(in srgb,var(--canvas) 78%,transparent);color:var(--text-strong);opacity:0;place-items:center;transition:opacity 120ms ease}.image-upload:hover .overlay,.image-upload:focus-visible .overlay,.image-upload.saving .overlay,.image-upload.saved .overlay{opacity:1}.image-upload.saving .overlay>:global(svg){animation:spin .7s linear infinite}.image-upload.saved .overlay{background:color-mix(in srgb,var(--success-soft) 88%,transparent);color:var(--success)}.status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}@keyframes spin{to{transform:rotate(360deg)}}
</style>
