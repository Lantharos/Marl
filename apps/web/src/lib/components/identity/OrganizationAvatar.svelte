<script lang="ts">
  import { initials } from './initials';

  let {
    name,
    src = null,
    size = 32,
    label = ''
  }: { name: string; src?: string | null; size?: number; label?: string } = $props();
</script>

<span
  class="inline-grid shrink-0 place-items-center overflow-hidden rounded-[22%] bg-brand-soft leading-none font-bold text-brand-strong"
  style:width={`${size}px`}
  style:height={`${size}px`}
  style:font-size={`${Math.max(8, Math.round(size * 0.32))}px`}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
>
  {#if src}<img {src} alt="" class="size-full object-cover" />{:else}{initials(name)}{/if}
</span>
