<script lang="ts">
  import { avatarTone, initials } from './initials';

  let {
    name,
    src = null,
    size = 28,
    label = ''
  }: { name: string; src?: string | null; size?: number; label?: string } = $props();
  const [background, color] = $derived(avatarTone(name));
</script>

<span
  class="inline-grid shrink-0 place-items-center overflow-hidden rounded-full leading-none font-bold"
  style:width={`${size}px`}
  style:height={`${size}px`}
  style:font-size={`${Math.max(8, Math.round(size * 0.34))}px`}
  style:background={src ? undefined : background}
  style:color
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
>
  {#if src}<img {src} alt="" class="size-full object-cover" />{:else}{initials(name)}{/if}
</span>
